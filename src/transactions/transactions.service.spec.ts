import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Decimal } from '@prisma/client/runtime/library';
import { TransactionsService } from './transactions.service';
import { PrismaService } from '../database/prisma.service';
import { BlockchainService } from '../blockchain/blockchain.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TransactionAnalyticsGranularity, TransactionTypeDto } from './dto/transaction.dto';
import { CommissionsService } from '../commissions/commissions.service';
import { TransactionFeesService } from './transaction-fees.service';
import { TimelineService } from './timeline.service';
import { TransactionAuditService } from './transaction-audit.service';

describe('TransactionsService', () => {
  let service: TransactionsService;
  let prisma: PrismaService;

  const mockPrismaService = {
    transaction: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    property: {
      findUnique: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  };

  const mockBlockchainService = {
    isValidAddress: jest.fn().mockReturnValue(true),
    recordTransactionOnBlockchain: jest.fn(),
    verifyBlockchainTransaction: jest.fn(),
    getBlockchainStats: jest.fn(),
  };

  const mockNotificationsService = {
    sendNotification: jest.fn(),
    handleTransactionUpdate: jest.fn(),
  };

  const mockCommissionsService = {
    createCommissionsForTransaction: jest.fn().mockResolvedValue(undefined),
    updateCommissionsStatus: jest.fn().mockResolvedValue(undefined),
  };

  const mockTransactionFeesService = {
    calculateFees: jest.fn().mockReturnValue({
      platformFee: 0,
      agentCommission: 0,
    }),
  };

  const mockTimelineService = {
    addMilestone: jest.fn(),
    updateMilestone: jest.fn(),
    getTimeline: jest.fn(),
    addStageEvent: jest.fn(),
  };

  const mockAuditService = {
    log: jest.fn(),
    findByTransaction: jest.fn(),
  };

  const mockTransaction = {
    id: 't-1',
    buyerId: 'user-1',
    sellerId: 'user-2',
    propertyId: 'prop-1',
    amount: new Decimal('100000'),
    type: 'SALE',
    status: 'PENDING',
    notes: null,
    blockchainHash: null,
    contractAddress: null,
    feeBreakdown: null,
    escrowStatus: null,
    escrowAmount: null,
    paymentStatus: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    buyer: { id: 'user-1', email: 'b@test.com', firstName: 'B', lastName: 'B' },
    seller: { id: 'user-2', email: 's@test.com', firstName: 'S', lastName: 'S' },
    property: { id: 'prop-1', title: 'Test', address: '123 Main' },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: BlockchainService, useValue: mockBlockchainService },
        { provide: NotificationsService, useValue: mockNotificationsService },
        { provide: CommissionsService, useValue: mockCommissionsService },
        { provide: TransactionFeesService, useValue: mockTransactionFeesService },
        { provide: TimelineService, useValue: mockTimelineService },
        { provide: TransactionAuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<TransactionsService>(TransactionsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return paginated transactions', async () => {
      mockPrismaService.transaction.findMany.mockResolvedValue([]);
      mockPrismaService.transaction.count.mockResolvedValue(0);

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(prisma.transaction.findMany).toHaveBeenCalled();
      expect(prisma.transaction.count).toHaveBeenCalled();
      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('nextCursor');
      expect(result).toHaveProperty('previousCursor');
    });

    it('should apply filter params', async () => {
      mockPrismaService.transaction.findMany.mockResolvedValue([]);
      mockPrismaService.transaction.count.mockResolvedValue(0);

      await service.findAll({
        page: 1,
        limit: 10,
        propertyId: 'prop-1',
        buyerId: 'user-1',
        sellerId: 'user-2',
        status: 'PENDING' as any,
        type: 'SALE' as any,
      });

      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            propertyId: 'prop-1',
            buyerId: 'user-1',
            sellerId: 'user-2',
            status: 'PENDING',
            type: 'SALE',
          }),
        }),
      );
    });

    it('should apply cursor-based pagination', async () => {
      const cursor = Buffer.from('2026-01-01T00:00:00.000Z').toString('base64');
      mockPrismaService.transaction.findMany.mockResolvedValue([]);
      mockPrismaService.transaction.count.mockResolvedValue(0);

      await service.findAll({ page: 1, limit: 10, cursor } as any);

      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: { lt: new Date('2026-01-01T00:00:00.000Z') },
          }),
        }),
      );
    });

    it('should compute nextCursor when items fill the page', async () => {
      const items = Array.from({ length: 5 }, (_, i) => ({
        ...mockTransaction,
        id: `t-${i}`,
        createdAt: new Date(`2026-01-0${i + 1}T00:00:00.000Z`),
      }));
      mockPrismaService.transaction.findMany.mockResolvedValue(items);
      mockPrismaService.transaction.count.mockResolvedValue(5);

      const result = await service.findAll({ page: 1, limit: 5 });

      expect(result.nextCursor).toBeTruthy();
      expect(result.items).toHaveLength(5);
    });

    it('should return null nextCursor when fewer items than limit', async () => {
      mockPrismaService.transaction.findMany.mockResolvedValue([mockTransaction]);
      mockPrismaService.transaction.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.nextCursor).toBeNull();
    });
  });

  describe('findOne', () => {
    it('should return transaction if found', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValue(mockTransaction);

      const result = await service.findOne('t-1');
      expect(result.id).toBe('t-1');
    });

    it('should throw NotFoundException if not found', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create a transaction', async () => {
      mockPrismaService.property.findUnique.mockResolvedValue({ id: 'prop-1' });
      mockPrismaService.user.findUnique.mockResolvedValue({ id: 'user-1' });
      mockPrismaService.transaction.create.mockResolvedValue({
        id: 't-new',
        propertyId: 'prop-1',
        buyerId: 'user-1',
        sellerId: 'user-2',
        amount: 100000,
        type: 'SALE',
        status: 'PENDING',
        notes: null,
        blockchainHash: null,
        contractAddress: null,
        feeBreakdown: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.create({
        propertyId: 'prop-1',
        buyerId: 'user-1',
        sellerId: 'user-2',
        amount: 100000,
        type: TransactionTypeDto.SALE,
      });

      expect(result.id).toBe('t-new');
      expect(mockCommissionsService.createCommissionsForTransaction).toHaveBeenCalledWith('t-new');
    });

    it('should throw NotFoundException if property not found', async () => {
      mockPrismaService.property.findUnique.mockResolvedValue(null);

      await expect(
        service.create({
          propertyId: 'nonexistent',
          buyerId: 'user-1',
          sellerId: 'user-2',
          amount: 100000,
          type: TransactionTypeDto.SALE,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if buyer not found', async () => {
      mockPrismaService.property.findUnique.mockResolvedValue({ id: 'prop-1' });
      mockPrismaService.user.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'user-2' });

      await expect(
        service.create({
          propertyId: 'prop-1',
          buyerId: 'nonexistent',
          sellerId: 'user-2',
          amount: 100000,
          type: TransactionTypeDto.SALE,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update a transaction', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValue(mockTransaction);
      mockPrismaService.transaction.update.mockResolvedValue({
        ...mockTransaction,
        status: 'COMPLETED',
      });

      const result = await service.update('t-1', { status: 'COMPLETED' as any });

      expect(result.status).toBe('COMPLETED');
      expect(mockCommissionsService.updateCommissionsStatus).toHaveBeenCalledWith(
        't-1',
        'COMPLETED',
      );
    });

    it('should throw NotFoundException if transaction not found', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValue(null);

      await expect(service.update('nonexistent', { status: 'COMPLETED' as any })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateTransactionStatus', () => {
    it('should update transaction status with audit log', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValue(mockTransaction);
      mockPrismaService.transaction.update.mockResolvedValue({
        ...mockTransaction,
        status: 'COMPLETED',
      });

      const result = await service.updateTransactionStatus('t-1', 'COMPLETED', 'admin-1');

      expect(result.status).toBe('COMPLETED');
      expect(mockAuditService.log).toHaveBeenCalled();
      expect(mockTimelineService.addStageEvent).toHaveBeenCalledWith('t-1', 'COMPLETED');
    });

    it('should reject invalid status transition', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValue({
        ...mockTransaction,
        status: 'COMPLETED',
      });

      await expect(service.updateTransactionStatus('t-1', 'PENDING', 'admin-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException if transaction not found', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValue(null);

      await expect(service.updateTransactionStatus('nonexistent', 'COMPLETED')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('recordOnBlockchain', () => {
    it('should record a transaction on the blockchain', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValue(mockTransaction);
      mockBlockchainService.recordTransactionOnBlockchain.mockResolvedValue({
        blockchainHash: '0xabc123',
        contractAddress: '0xcontract',
      });
      mockPrismaService.transaction.update.mockResolvedValue({
        ...mockTransaction,
        blockchainHash: '0xabc123',
        contractAddress: '0xcontract',
      });

      const result = await service.recordOnBlockchain('t-1', {
        buyerAddress: '0xbuyer',
        sellerAddress: '0xseller',
      });

      expect(result.blockchain.blockchainHash).toBe('0xabc123');
      expect(mockBlockchainService.recordTransactionOnBlockchain).toHaveBeenCalled();
    });

    it('should reject if already recorded on blockchain', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValue({
        ...mockTransaction,
        blockchainHash: '0xexisting',
      });

      await expect(
        service.recordOnBlockchain('t-1', { buyerAddress: '0xbuyer', sellerAddress: '0xseller' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if transaction not found', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValue(null);

      await expect(
        service.recordOnBlockchain('nonexistent', {
          buyerAddress: '0xbuyer',
          sellerAddress: '0xseller',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('verifyOnBlockchain', () => {
    it('should verify a blockchain transaction', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValue({
        ...mockTransaction,
        blockchainHash: '0xabc123',
      });
      mockBlockchainService.verifyBlockchainTransaction.mockResolvedValue({
        verified: true,
        status: 'success',
      });

      const result = await service.verifyOnBlockchain('t-1');

      expect(result.verified).toBe(true);
    });

    it('should reject if not recorded on blockchain', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValue(mockTransaction);

      await expect(service.verifyOnBlockchain('t-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if transaction not found', async () => {
      mockPrismaService.transaction.findUnique.mockResolvedValue(null);

      await expect(service.verifyOnBlockchain('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getBlockchainStats', () => {
    it('should return blockchain stats', async () => {
      mockBlockchainService.getBlockchainStats.mockResolvedValue({ totalBlocks: 100 });

      const result = await service.getBlockchainStats();

      expect(result).toEqual({ totalBlocks: 100 });
    });
  });

  describe('getAnalytics', () => {
    it('should calculate volume trends, average price, completion rate, and revenue', async () => {
      mockPrismaService.transaction.findMany.mockResolvedValue([
        {
          amount: new Decimal('100000'),
          status: 'COMPLETED',
          createdAt: new Date('2026-01-10T00:00:00.000Z'),
        },
        {
          amount: new Decimal('200000'),
          status: 'PENDING',
          createdAt: new Date('2026-01-20T00:00:00.000Z'),
        },
        {
          amount: new Decimal('300000'),
          status: 'COMPLETED',
          createdAt: new Date('2026-02-05T00:00:00.000Z'),
        },
        {
          amount: new Decimal('400000'),
          status: 'CANCELLED',
          createdAt: new Date('2026-02-12T00:00:00.000Z'),
        },
      ]);

      const result = await service.getAnalytics({
        granularity: TransactionAnalyticsGranularity.MONTH,
      });

      expect(prisma.transaction.findMany).toHaveBeenCalledWith({
        where: {},
        select: {
          amount: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      });
      expect(result).toEqual({
        totalTransactions: 4,
        completedTransactions: 2,
        pendingTransactions: 1,
        cancelledTransactions: 1,
        totalVolume: 1000000,
        averagePrice: 250000,
        completionRate: 50,
        revenue: 400000,
        volumeTrends: [
          {
            period: '2026-01',
            transactionCount: 2,
            totalVolume: 300000,
            completedCount: 1,
            revenue: 100000,
          },
          {
            period: '2026-02',
            transactionCount: 2,
            totalVolume: 700000,
            completedCount: 1,
            revenue: 300000,
          },
        ],
      });
    });

    it('should apply date and type filters', async () => {
      const startDate = new Date('2026-01-01T00:00:00.000Z');
      const endDate = new Date('2026-01-31T23:59:59.000Z');

      mockPrismaService.transaction.findMany.mockResolvedValue([]);

      const result = await service.getAnalytics({
        startDate,
        endDate,
        type: TransactionTypeDto.SALE,
        granularity: TransactionAnalyticsGranularity.DAY,
      });

      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            type: TransactionTypeDto.SALE,
            createdAt: {
              gte: startDate,
              lte: endDate,
            },
          },
        }),
      );
      expect(result.totalTransactions).toBe(0);
      expect(result.averagePrice).toBe(0);
      expect(result.completionRate).toBe(0);
      expect(result.revenue).toBe(0);
      expect(result.volumeTrends).toEqual([]);
    });

    it('should cap date ranges larger than maxDays', async () => {
      const startDate = new Date('2025-01-01T00:00:00.000Z');
      const endDate = new Date('2026-01-02T00:00:00.000Z');
      await expect(
        service.getAnalytics({
          startDate,
          endDate,
          granularity: TransactionAnalyticsGranularity.MONTH,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.transaction.findMany).not.toHaveBeenCalled();
    });

    it('should handle empty transactions', async () => {
      mockPrismaService.transaction.findMany.mockResolvedValue([]);

      const result = await service.getAnalytics({
        granularity: TransactionAnalyticsGranularity.MONTH,
      });

      expect(result.totalTransactions).toBe(0);
      expect(result.averagePrice).toBe(0);
      expect(result.completionRate).toBe(0);
      expect(result.revenue).toBe(0);
      expect(result.volumeTrends).toEqual([]);
    });

    it('should cap startDate-only range', async () => {
      const startDate = new Date('2026-01-01T00:00:00.000Z');
      mockPrismaService.transaction.findMany.mockResolvedValue([]);

      await service.getAnalytics({ startDate, maxDays: 30 });

      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: expect.objectContaining({
              gte: startDate,
            }),
          }),
        }),
      );
    });

    it('should cap endDate-only range', async () => {
      const endDate = new Date('2026-06-01T00:00:00.000Z');
      mockPrismaService.transaction.findMany.mockResolvedValue([]);

      await service.getAnalytics({ endDate, maxDays: 30 });

      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: expect.objectContaining({
              lte: endDate,
            }),
          }),
        }),
      );
    });
  });
});
