import { Test, TestingModule } from '@nestjs/testing';
import { PropertiesService } from './properties.service';
import { PrismaService } from '../database/prisma.service';
import { FraudService } from '../fraud/fraud.service';
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';

describe('PropertiesService - Agent Assignment', () => {
  let service: PropertiesService;
  let prisma: PrismaService;

  const mockPrismaService = {
    property: {
      findUnique: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    propertyAgent: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
    },
  };

  const mockFraudService = {
    evaluatePropertyCreated: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PropertiesService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: FraudService, useValue: mockFraudService },
      ],
    }).compile();

    service = module.get<PropertiesService>(PropertiesService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('assignAgent', () => {
    it('successfully assigns an agent when caller is owner', async () => {
      mockPrismaService.property.findUnique.mockResolvedValue({ id: 'prop-1', ownerId: 'owner-1' });
      mockPrismaService.user.findUnique.mockResolvedValue({ id: 'agent-1', role: 'AGENT' });
      mockPrismaService.propertyAgent.findUnique.mockResolvedValue(null);
      mockPrismaService.propertyAgent.create.mockResolvedValue({ id: 'assign-1' });

      const result = await service.assignAgent(
        'prop-1',
        { agentId: 'agent-1', commissionRate: 0.05, contactPhone: '12345' },
        { sub: 'owner-1', email: 'owner@test.com', role: 'USER', type: 'access' },
      );

      expect((prisma as any).propertyAgent.create).toHaveBeenCalledWith({
        data: {
          propertyId: 'prop-1',
          agentId: 'agent-1',
          commissionRate: new Decimal('0.05'),
          contactPhone: '12345',
          contactEmail: null,
        },
        include: expect.any(Object),
      });
      expect(result).toBeDefined();
    });

    it('rejects if caller is not property owner or admin', async () => {
      mockPrismaService.property.findUnique.mockResolvedValue({ id: 'prop-1', ownerId: 'owner-1' });

      await expect(
        service.assignAgent(
          'prop-1',
          { agentId: 'agent-1' },
          { sub: 'other-user', email: 'other@test.com', role: 'USER', type: 'access' },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects if assigned user is not of role AGENT', async () => {
      mockPrismaService.property.findUnique.mockResolvedValue({ id: 'prop-1', ownerId: 'owner-1' });
      mockPrismaService.user.findUnique.mockResolvedValue({ id: 'user-1', role: 'USER' });

      await expect(
        service.assignAgent(
          'prop-1',
          { agentId: 'user-1' },
          { sub: 'owner-1', email: 'owner@test.com', role: 'USER', type: 'access' },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('updateAgentAssignment', () => {
    it('successfully updates an assignment', async () => {
      mockPrismaService.property.findUnique.mockResolvedValue({ id: 'prop-1', ownerId: 'owner-1' });
      mockPrismaService.propertyAgent.findUnique.mockResolvedValue({ id: 'assign-1' });
      mockPrismaService.propertyAgent.update.mockResolvedValue({
        id: 'assign-1',
        commissionRate: new Decimal('0.04'),
      });

      const result = await service.updateAgentAssignment(
        'prop-1',
        'agent-1',
        { commissionRate: 0.04 },
        { sub: 'owner-1', email: 'owner@test.com', role: 'USER', type: 'access' },
      );

      expect((prisma as any).propertyAgent.update).toHaveBeenCalledWith({
        where: {
          propertyId_agentId: {
            propertyId: 'prop-1',
            agentId: 'agent-1',
          },
        },
        data: {
          commissionRate: new Decimal('0.04'),
          contactPhone: undefined,
          contactEmail: undefined,
        },
        include: expect.any(Object),
      });
      expect(result).toBeDefined();
    });
  });

  describe('getAgents', () => {
    it('returns assigned agents resolving fallback contact details', async () => {
      mockPrismaService.property.findUnique.mockResolvedValue({ id: 'prop-1' });
      mockPrismaService.propertyAgent.findMany.mockResolvedValue([
        {
          id: 'assign-1',
          propertyId: 'prop-1',
          agentId: 'agent-1',
          commissionRate: new Decimal('0.03'),
          contactPhone: null,
          contactEmail: 'override@test.com',
          agent: {
            phone: 'agent-phone',
            email: 'agent-email@test.com',
          },
        },
      ]);

      const result = await service.getAgents('prop-1');

      expect(result).toEqual([
        expect.objectContaining({
          agentId: 'agent-1',
          commissionRate: 0.03,
          contactPhone: 'agent-phone', // falls back
          contactEmail: 'override@test.com', // custom override
        }),
      ]);
    });
  });
});
