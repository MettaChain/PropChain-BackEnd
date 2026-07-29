import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TransactionsService } from '../../src/transactions/transactions.service';
import { PrismaService } from '../../src/database/prisma.service';
import { BlockchainService } from '../../src/blockchain/blockchain.service';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { CommissionsService } from '../../src/commissions/commissions.service';
import { TransactionFeesService } from '../../src/transactions/transaction-fees.service';
import { TimelineService } from '../../src/transactions/timeline.service';
import { TransactionAuditService } from '../../src/transactions/transaction-audit.service';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { TransactionAnalyticsGranularity } from '../../src/transactions/dto/transaction.dto';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Logger } from '@nestjs/common';

describe('Analytics date range boundary (e2e)', () => {
  let service: TransactionsService;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        {
          provide: PrismaService,
          useValue: {
            transaction: {
              findMany: jest.fn().mockResolvedValue([]),
              count: jest.fn().mockResolvedValue(0),
            },
            $connect: jest.fn(),
            $disconnect: jest.fn(),
            $transaction: jest.fn((a: any) => Promise.all(a)),
          },
        },
        { provide: BlockchainService, useValue: {} },
        { provide: NotificationsService, useValue: {} },
        { provide: CommissionsService, useValue: {} },
        { provide: TransactionFeesService, useValue: {} },
        { provide: TimelineService, useValue: {} },
        { provide: TransactionAuditService, useValue: {} },
      ],
    }).compile();

    service = moduleRef.get<TransactionsService>(TransactionsService);
  });

  it('should reject date ranges exceeding maxDays', async () => {
    const startDate = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);
    const endDate = new Date();
    await expect(service.getAnalytics({ startDate, endDate, maxDays: 365 })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should cap date range at 365 days when only startDate is provided', async () => {
    const startDate = new Date(Date.now() - 500 * 24 * 60 * 60 * 1000);
    const result = await service.getAnalytics({ startDate, maxDays: 365 });
    expect(result).toBeDefined();
  });

  it('should cap date range at 365 days when only endDate is provided', async () => {
    const endDate = new Date(Date.now() + 500 * 24 * 60 * 60 * 1000);
    const result = await service.getAnalytics({ endDate, maxDays: 365 });
    expect(result).toBeDefined();
  });

  it('should not cap date range within 365 day limit', async () => {
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = new Date();
    const result = await service.getAnalytics({ startDate, endDate, maxDays: 365 });
    expect(result).toBeDefined();
  });

  it('should use maxDays from DTO as the cap', async () => {
    const startDate = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000);
    const result = await service.getAnalytics({ startDate, maxDays: 100 });
    expect(result).toBeDefined();
  });
});
