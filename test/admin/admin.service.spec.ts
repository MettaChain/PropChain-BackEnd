import { NotFoundException } from '@nestjs/common';
import { AdminService } from '../../src/admin/admin.service';
import { PrismaService } from '../../src/database/prisma.service';
import { FraudService } from '../../src/fraud/fraud.service';
import { BackupService } from '../../src/backup/backup.service';
import { TransactionsService } from '../../src/transactions/transactions.service';
import { SessionsService } from '../../src/sessions/sessions.service';
import {
  UserRole,
  PropertyStatus,
  TransactionStatus,
  FraudStatus,
} from '../../src/types/prisma.types';
import { BulkModerationAction } from '../../src/admin/dto/admin.dto';

interface MockPrisma {
  user: {
    count: jest.Mock;
    findMany: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  property: {
    count: jest.Mock;
    findMany: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
  transaction: {
    count: jest.Mock;
    aggregate: jest.Mock;
  };
  activityLog: {
    create: jest.Mock;
    createMany: jest.Mock;
  };
}

interface MockFraudService {
  listAlerts: jest.Mock;
  getAlertSummary: jest.Mock;
  getAlertDetails: jest.Mock;
  reviewAlert: jest.Mock;
  addInvestigationNote: jest.Mock;
  blockUserFromAlert: jest.Mock;
  runUserScan: jest.Mock;
  runPropertyScan: jest.Mock;
}

describe('AdminService', () => {
  let service: AdminService;
  let mockPrisma: MockPrisma;
  let mockFraudService: MockFraudService;
  let mockBackupService: { createManualBackup: jest.Mock; listBackups: jest.Mock };
  let mockTransactionsService: { updateTransactionStatus: jest.Mock };
  let mockSessionsService: { revokeAllSessions: jest.Mock };

  beforeEach(() => {
    mockPrisma = {
      user: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
      property: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({
          id: 'prop-1',
          ownerId: 'user-1',
          status: PropertyStatus.ARCHIVED,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      transaction: {
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 1000 } }),
      },
      activityLog: {
        create: jest.fn().mockResolvedValue({}),
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };

    mockFraudService = {
      listAlerts: jest.fn().mockResolvedValue([]),
      getAlertSummary: jest.fn().mockResolvedValue({}),
      getAlertDetails: jest.fn().mockResolvedValue({}),
      reviewAlert: jest.fn().mockResolvedValue({}),
      addInvestigationNote: jest.fn().mockResolvedValue({}),
      blockUserFromAlert: jest.fn().mockResolvedValue({}),
      runUserScan: jest.fn().mockResolvedValue({}),
      runPropertyScan: jest.fn().mockResolvedValue({}),
    };

    mockBackupService = {
      createManualBackup: jest.fn().mockResolvedValue({}),
      listBackups: jest.fn().mockResolvedValue([]),
    };

    mockTransactionsService = {
      updateTransactionStatus: jest.fn().mockResolvedValue({}),
    };

    mockSessionsService = {
      revokeAllSessions: jest.fn().mockResolvedValue({}),
    };

    service = new AdminService(
      mockPrisma as unknown as PrismaService,
      mockFraudService as unknown as FraudService,
      mockBackupService as unknown as BackupService,
      mockTransactionsService as unknown as TransactionsService,
      mockSessionsService as unknown as SessionsService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getDashboard()', () => {
    it('aggregates user, property, and transaction stats', async () => {
      mockPrisma.user.count
        .mockResolvedValueOnce(100) // total users
        .mockResolvedValueOnce(10); // blocked users
      mockPrisma.property.count
        .mockResolvedValueOnce(50) // total properties
        .mockResolvedValueOnce(5) // pending
        .mockResolvedValueOnce(30); // active
      mockPrisma.transaction.count
        .mockResolvedValueOnce(40) // completed
        .mockResolvedValueOnce(8); // pending

      const result = await service.getDashboard();

      expect(result.userStats).toEqual({
        totalUsers: 100,
        blockedUsers: 10,
        activeUsers: 90,
      });
      expect(result.propertyStats).toEqual({
        totalProperties: 50,
        pendingProperties: 5,
        activeProperties: 30,
      });
      expect(result.revenueMetrics.totalSalesRevenue).toBe(1000);
      expect(result.revenueMetrics.totalTransferRevenue).toBe(1000);
      expect(result.systemHealth).toEqual({ completedTransactions: 40, pendingTransactions: 8 });
    });
  });

  describe('listUsers()', () => {
    it('paginates users with page/limit defaults', async () => {
      mockPrisma.user.findMany.mockResolvedValue([{ id: 'u1' }, { id: 'u2' }]);

      const result = await service.listUsers({});

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20, orderBy: { createdAt: 'desc' } }),
      );
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.nextCursor).toBeNull();
      expect(result.previousCursor).toBeNull();
    });

    it('applies search filter when provided', async () => {
      await service.listUsers({ search: 'alice', page: 2, limit: 10 });

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 10,
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ email: expect.objectContaining({ contains: 'alice' }) }),
            ]),
          }),
        }),
      );
    });

    it('uses cursor pagination when a cursor is provided', async () => {
      const cursor = Buffer.from('2026-01-01T00:00:00.000Z').toString('base64');
      mockPrisma.user.findMany.mockResolvedValue([]);

      const result = await service.listUsers({ cursor });

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: { lt: new Date('2026-01-01T00:00:00.000Z') },
          }),
        }),
      );
      // Skip is undefined when using cursor so the query does not double-offset
      expect(mockPrisma.user.findMany.mock.calls[0][0]).not.toHaveProperty('skip');
      expect(result.previousCursor).toBe(cursor);
    });

    it('builds a nextCursor when the page is full', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 'u1', createdAt: new Date('2026-05-01T00:00:00.000Z') },
        { id: 'u2', createdAt: new Date('2026-05-02T00:00:00.000Z') },
      ]);

      const result = await service.listUsers({ limit: 2 });

      expect(result.nextCursor).toBe(Buffer.from('2026-05-02T00:00:00.000Z').toString('base64'));
    });
  });

  describe('updateUser()', () => {
    const existingUser = {
      id: 'u1',
      email: 'user@example.com',
      role: UserRole.USER,
    };

    it('throws NotFoundException when the user does not exist', async () => {
      await expect(service.updateUser('missing', { firstName: 'X' })).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('updates user fields and returns the updated user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(existingUser);
      mockPrisma.user.update.mockResolvedValue({
        id: 'u1',
        email: 'user@example.com',
        firstName: 'Alice',
        role: UserRole.USER,
        isBlocked: false,
      });

      const result = await service.updateUser('u1', { firstName: 'Alice' });

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'u1' }, data: { firstName: 'Alice' } }),
      );
      expect(result.firstName).toBe('Alice');
    });

    it('audit-logs a role change and revokes sessions', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(existingUser);
      mockPrisma.user.update.mockResolvedValue({ id: 'u1', role: UserRole.ADMIN });

      await service.updateUser('u1', { role: UserRole.ADMIN }, 'admin-1');

      expect(mockPrisma.activityLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'admin-1',
            action: 'ROLE_CHANGE',
            entityType: 'USER',
            entityId: 'u1',
          }),
        }),
      );
      expect(mockSessionsService.revokeAllSessions).toHaveBeenCalledWith('u1');
    });

    it('audit-logs block and unblock state changes', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(existingUser);
      mockPrisma.user.update.mockResolvedValue({ id: 'u1', isBlocked: true });

      await service.updateUser('u1', { isBlocked: true });
      await service.updateUser('u1', { isBlocked: false });

      const actions = mockPrisma.activityLog.create.mock.calls.map((call) => call[0].data.action);
      expect(actions).toEqual(['USER_BLOCKED', 'USER_UNBLOCKED']);
    });
  });

  describe('setUserBlockedState()', () => {
    it('blocks a user', async () => {
      mockPrisma.user.update.mockResolvedValue({ id: 'u1', email: 'a@b.c', isBlocked: true });

      const result = await service.setUserBlockedState('u1', true);

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'u1' }, data: { isBlocked: true } }),
      );
      expect(result.isBlocked).toBe(true);
    });
  });

  describe('getModerationQueue()', () => {
    it('defaults to pending properties when no status filter is given', async () => {
      await service.getModerationQueue({});

      expect(mockPrisma.property.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: PropertyStatus.PENDING },
          take: 20,
          orderBy: { createdAt: 'asc' },
        }),
      );
    });

    it('honors the status filter and cursor', async () => {
      const cursor = Buffer.from('2026-03-01T00:00:00.000Z').toString('base64');
      await service.getModerationQueue({ status: PropertyStatus.ACTIVE, cursor });

      expect(mockPrisma.property.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: PropertyStatus.ACTIVE,
            createdAt: { lt: new Date('2026-03-01T00:00:00.000Z') },
          },
        }),
      );
    });
  });

  describe('property moderation actions', () => {
    it('approveProperty activates the listing', async () => {
      await service.approveProperty('prop-1');

      expect(mockPrisma.property.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'prop-1' },
          data: { status: PropertyStatus.ACTIVE },
        }),
      );
    });

    it('rejectProperty archives the listing', async () => {
      await service.rejectProperty('prop-1');

      expect(mockPrisma.property.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'prop-1' },
          data: { status: PropertyStatus.ARCHIVED },
        }),
      );
    });

    it('flagProperty archives the listing and writes an activity log', async () => {
      await service.flagProperty('prop-1', 'duplicate listing');

      expect(mockPrisma.property.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'prop-1' },
          data: { status: PropertyStatus.ARCHIVED },
        }),
      );
      expect(mockPrisma.activityLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            action: 'PROPERTY_FLAGGED_BY_ADMIN',
            entityId: 'prop-1',
            description: 'duplicate listing',
          }),
        }),
      );
    });
  });

  describe('bulkModerate()', () => {
    it('approves properties in bulk', async () => {
      const result = await service.bulkModerate({
        propertyIds: ['p1', 'p2'],
        action: BulkModerationAction.APPROVE,
      });

      expect(mockPrisma.property.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ['p1', 'p2'] } },
          data: { status: PropertyStatus.ACTIVE },
        }),
      );
      expect(result).toEqual({ updatedCount: 2, action: BulkModerationAction.APPROVE });
    });

    it('flags properties in bulk and logs each owner', async () => {
      mockPrisma.property.findMany.mockResolvedValue([
        { id: 'p1', ownerId: 'u1' },
        { id: 'p2', ownerId: 'u2' },
      ]);

      await service.bulkModerate({
        propertyIds: ['p1', 'p2'],
        action: BulkModerationAction.FLAG,
        reason: 'spam',
      });

      expect(mockPrisma.property.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: PropertyStatus.ARCHIVED } }),
      );
      expect(mockPrisma.activityLog.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ userId: 'u1', entityId: 'p1', description: 'spam' }),
            expect.objectContaining({ userId: 'u2', entityId: 'p2', description: 'spam' }),
          ]),
        }),
      );
    });
  });

  describe('fraud actions', () => {
    it('lists fraud alerts through the fraud service', async () => {
      mockFraudService.listAlerts.mockResolvedValue([{ id: 'alert-1' }]);

      const result = await service.listFraudAlerts({ status: FraudStatus.OPEN });

      expect(mockFraudService.listAlerts).toHaveBeenCalledWith({ status: FraudStatus.OPEN });
      expect(result).toEqual([{ id: 'alert-1' }]);
    });

    it('returns the fraud alert summary', async () => {
      mockFraudService.getAlertSummary.mockResolvedValue({ open: 3 });

      await expect(service.getFraudAlertsSummary()).resolves.toEqual({ open: 3 });
    });

    it('reviews a fraud alert with the acting admin', async () => {
      await service.reviewFraudAlert('alert-1', { status: FraudStatus.RESOLVED }, 'admin-1');

      expect(mockFraudService.reviewAlert).toHaveBeenCalledWith(
        'alert-1',
        { status: FraudStatus.RESOLVED },
        'admin-1',
      );
    });

    it('adds an investigation note', async () => {
      await service.addFraudAlertNote('alert-1', { note: 'check logs' }, 'admin-1');

      expect(mockFraudService.addInvestigationNote).toHaveBeenCalledWith(
        'alert-1',
        { note: 'check logs' },
        'admin-1',
      );
    });

    it('blocks a fraud user from an alert', async () => {
      await service.blockFraudUser('alert-1', 'admin-1', { reason: 'confirmed' });

      expect(mockFraudService.blockUserFromAlert).toHaveBeenCalledWith('alert-1', 'admin-1', {
        reason: 'confirmed',
      });
    });

    it('scans a user for fraud and delegates to the fraud service', async () => {
      await service.scanUserForFraud('user-7', 'admin-1');

      expect(mockFraudService.runUserScan).toHaveBeenCalledWith('user-7', 'admin-1');
    });

    it('scans a property for fraud and delegates to the fraud service', async () => {
      await service.scanPropertyForFraud('prop-9', 'admin-2');

      expect(mockFraudService.runPropertyScan).toHaveBeenCalledWith('prop-9', 'admin-2');
    });
  });

  describe('transaction monitoring', () => {
    it('delegates status updates to the transactions service with the actor', async () => {
      await service.updateTransactionStatus(
        'tx-1',
        { status: TransactionStatus.COMPLETED },
        'admin-1',
      );

      expect(mockTransactionsService.updateTransactionStatus).toHaveBeenCalledWith(
        'tx-1',
        'COMPLETED',
        'admin-1',
      );
    });
  });
});
