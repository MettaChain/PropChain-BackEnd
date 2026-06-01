import { Test, TestingModule } from '@nestjs/testing';
import { Decimal } from '@prisma/client/runtime/library';
import { TransactionsService } from './transactions.service';
import { PrismaService } from '../database/prisma.service';
import { BlockchainService } from '../blockchain/blockchain.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TransactionAnalyticsGranularity, TransactionTypeDto } from './dto/transaction.dto';
import { CommissionsService } from '../commissions/commissions.service';

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

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: BlockchainService, useValue: mockBlockchainService },
        { provide: NotificationsService, useValue: mockNotificationsService },
        { provide: CommissionsService, useValue: mockCommissionsService },
      ],
    }).compile();

    service = module.get<TransactionsService>(TransactionsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should call prisma findMany and count with correct arguments', async () => {
      const query = {
        page: 1,
        limit: 10,
      };

      mockPrismaService.transaction.findMany.mockResolvedValue([]);
      mockPrismaService.transaction.count.mockResolvedValue(0);

      const result = await service.findAll(query);

      expect(prisma.transaction.findMany).toHaveBeenCalled();
      expect(prisma.transaction.count).toHaveBeenCalled();
      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('total');
    });
  });

  describe('findOne', () => {
    it('should return transaction if found', async () => {
      const mockTransaction = {
        id: 't-1',
        buyerId: 'user-1',
        sellerId: 'user-2',
        propertyId: 'prop-1',
        amount: 100000,
        type: 'SALE',
        status: 'PENDING',
        notes: null,
        blockchainHash: null,
        contractAddress: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        buyer: { id: 'user-1', email: 'b@test.com', firstName: 'B', lastName: 'B' },
        seller: { id: 'user-2', email: 's@test.com', firstName: 'S', lastName: 'S' },
        property: { id: 'prop-1', title: 'Test', address: '123 Main' },
      };
      mockPrismaService.transaction.findUnique.mockResolvedValue(mockTransaction);

      const result = await service.findOne('t-1');
      expect(result.id).toBe('t-1');
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
        blockchianHash: null,
        contractAddress: null,
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
  });
});
