import { Test, TestingModule } from '@nestjs/testing';
import { CommissionsService } from './commissions.service';
import { PrismaService } from '../database/prisma.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';

describe('CommissionsService', () => {
  let service: CommissionsService;
  let prisma: PrismaService;

  const mockPrismaService = {
    transaction: {
      findUnique: jest.fn(),
    },
    commission: {
      findUnique: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CommissionsService, { provide: PrismaService, useValue: mockPrismaService }],
    }).compile();

    service = module.get<CommissionsService>(CommissionsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createCommissionsForTransaction', () => {
    it('creates commission records based on assigned agents and commission rates', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValue({
        id: 'tx-1',
        amount: new Decimal('500000'),
        status: 'PENDING',
        propertyId: 'prop-1',
        property: {
          agents: [
            { agentId: 'agent-1', commissionRate: new Decimal('0.02') },
            { agentId: 'agent-2', commissionRate: new Decimal('0.035') },
          ],
        },
      });
      mockPrismaService.commission.findUnique.mockResolvedValue(null);

      await service.createCommissionsForTransaction('tx-1');

      expect((prisma as any).commission.create).toHaveBeenCalledTimes(2);
      expect((prisma as any).commission.create).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          data: {
            transactionId: 'tx-1',
            agentId: 'agent-1',
            propertyId: 'prop-1',
            amount: new Decimal('10000.00'), // 500000 * 0.02
            rate: new Decimal('0.02'),
            status: 'PENDING',
          },
        }),
      );
      expect((prisma as any).commission.create).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          data: {
            transactionId: 'tx-1',
            agentId: 'agent-2',
            propertyId: 'prop-1',
            amount: new Decimal('17500.000'), // 500000 * 0.035
            rate: new Decimal('0.035'),
            status: 'PENDING',
          },
        }),
      );
    });
  });

  describe('updateCommissionsStatus', () => {
    it('syncs statuses with transaction', async () => {
      mockPrismaService.commission.updateMany.mockResolvedValue({ count: 2 });

      await service.updateCommissionsStatus('tx-1', 'COMPLETED');

      expect((prisma as any).commission.updateMany).toHaveBeenCalledWith({
        where: { transactionId: 'tx-1' },
        data: { status: 'COMPLETED' },
      });
    });
  });

  describe('findAll', () => {
    it('enforces agent filter for AGENT users', async () => {
      mockPrismaService.commission.findMany.mockResolvedValue([]);
      mockPrismaService.commission.count.mockResolvedValue(0);

      await service.findAll(
        { page: 1, limit: 10 },
        { sub: 'agent-1', email: 'agent@test.com', role: 'AGENT', type: 'access' },
      );

      expect((prisma as any).commission.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ agentId: 'agent-1' }),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('throws Forbidden if agent requests another agent commission record', async () => {
      mockPrismaService.commission.findUnique.mockResolvedValue({
        id: 'c-1',
        agentId: 'agent-1',
        amount: new Decimal('1000'),
        rate: new Decimal('0.03'),
        property: { price: new Decimal('100000') },
        transaction: { amount: new Decimal('100000') },
      });

      await expect(
        service.findOne('c-1', {
          sub: 'agent-2',
          email: 'agent2@test.com',
          role: 'AGENT',
          type: 'access',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('getStats', () => {
    it('computes metrics globally for administrators', async () => {
      mockPrismaService.commission.aggregate
        .mockResolvedValueOnce({ _sum: { amount: new Decimal('30000') } }) // COMPLETED
        .mockResolvedValueOnce({ _sum: { amount: new Decimal('15000') } }) // PENDING
        .mockResolvedValueOnce({ _sum: { amount: new Decimal('0') } }); // CANCELLED
      mockPrismaService.commission.count
        .mockResolvedValueOnce(3) // COMPLETED
        .mockResolvedValueOnce(2); // PENDING
      mockPrismaService.commission.findMany.mockResolvedValue([
        {
          agentId: 'agent-1',
          amount: new Decimal('10000'),
          status: 'COMPLETED',
          agent: { firstName: 'Agent', lastName: 'One', email: 'a1@test.com' },
        },
        {
          agentId: 'agent-1',
          amount: new Decimal('5000'),
          status: 'PENDING',
          agent: { firstName: 'Agent', lastName: 'One', email: 'a1@test.com' },
        },
      ]);

      const result = await service.getStats({
        sub: 'admin-1',
        email: 'admin@test.com',
        role: 'ADMIN',
        type: 'access',
      });

      expect(result.totalEarned).toBe(30000);
      expect(result.totalPending).toBe(15000);
      expect(result.agentStats).toEqual([
        expect.objectContaining({
          agentId: 'agent-1',
          earned: 10000,
          pending: 5000,
        }),
      ]);
    });
  });
});
