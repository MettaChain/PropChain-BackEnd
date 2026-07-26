import { TransactionRemindersService } from './transaction-reminders.service';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CacheService } from '../cache/cache.service';

const mockMilestone = {
  id: 'ms-1',
  title: 'Inspection',
  expectedDate: new Date('2026-07-01'),
  transaction: { buyerId: 'buyer-1', sellerId: 'seller-1' },
};

const mockPrisma = {
  transactionMilestone: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
  userPreferences: {
    findUnique: jest.fn(),
  },
};

const mockNotifications = {
  sendNotification: jest.fn(),
};

const mockCache = {
  setNx: jest.fn(),
  del: jest.fn(),
};

function makeService(): TransactionRemindersService {
  return new TransactionRemindersService(
    mockPrisma as unknown as PrismaService,
    mockNotifications as unknown as NotificationsService,
    mockCache as unknown as CacheService,
  );
}

describe('TransactionRemindersService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNotifications.sendNotification.mockResolvedValue(undefined);
    mockPrisma.transactionMilestone.update.mockResolvedValue({});
    mockPrisma.userPreferences.findUnique.mockResolvedValue(null);
  });

  describe('distributed lock — lock acquired', () => {
    it('processes reminders when lock is successfully acquired', async () => {
      mockCache.setNx.mockResolvedValue(true);
      mockPrisma.transactionMilestone.findMany.mockResolvedValue([mockMilestone]);

      const result = await makeService().sendDeadlineReminders();

      expect(mockCache.setNx).toHaveBeenCalledWith('lock:transaction-reminders', '1', 300);
      expect(mockPrisma.transactionMilestone.findMany).toHaveBeenCalled();
      expect(result.sent).toBeGreaterThan(0);
    });
  });

  describe('distributed lock — lock unavailable', () => {
    it('skips processing when lock is already held by another instance', async () => {
      mockCache.setNx.mockResolvedValue(false);

      const result = await makeService().sendDeadlineReminders();

      expect(mockPrisma.transactionMilestone.findMany).not.toHaveBeenCalled();
      expect(mockNotifications.sendNotification).not.toHaveBeenCalled();
      expect(result.sent).toBe(0);
    });
  });

  describe('distributed lock — lock release', () => {
    it('releases lock after successful processing', async () => {
      mockCache.setNx.mockResolvedValue(true);
      mockPrisma.transactionMilestone.findMany.mockResolvedValue([]);

      await makeService().sendDeadlineReminders();

      expect(mockCache.del).toHaveBeenCalledWith('lock:transaction-reminders');
    });

    it('releases lock even when processing throws an error', async () => {
      mockCache.setNx.mockResolvedValue(true);
      mockPrisma.transactionMilestone.findMany.mockRejectedValue(new Error('DB error'));

      await expect(makeService().sendDeadlineReminders()).rejects.toThrow('DB error');

      expect(mockCache.del).toHaveBeenCalledWith('lock:transaction-reminders');
    });
  });

  describe('regression — existing reminder behavior', () => {
    it('sends notifications to buyer and seller for a pending milestone', async () => {
      mockCache.setNx.mockResolvedValue(true);
      mockPrisma.transactionMilestone.findMany.mockResolvedValue([mockMilestone]);

      const result = await makeService().sendDeadlineReminders(3);

      expect(mockNotifications.sendNotification).toHaveBeenCalledWith(
        'buyer-1',
        'Transaction Deadline Reminder',
        expect.stringContaining('Inspection'),
        'TRANSACTION_UPDATE',
        { milestoneId: 'ms-1' },
      );
      expect(mockNotifications.sendNotification).toHaveBeenCalledWith(
        'seller-1',
        'Transaction Deadline Reminder',
        expect.stringContaining('Inspection'),
        'TRANSACTION_UPDATE',
        { milestoneId: 'ms-1' },
      );
      expect(result.sent).toBe(2);
    });

    it('marks milestone as reminded after sending', async () => {
      mockCache.setNx.mockResolvedValue(true);
      mockPrisma.transactionMilestone.findMany.mockResolvedValue([mockMilestone]);

      await makeService().sendDeadlineReminders();

      expect(mockPrisma.transactionMilestone.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ms-1' },
          data: expect.objectContaining({ reminderSentAt: expect.any(Date) }),
        }),
      );
    });

    it('does not send duplicate notification when buyer and seller are the same user', async () => {
      mockCache.setNx.mockResolvedValue(true);
      const sameUserMilestone = {
        ...mockMilestone,
        transaction: { buyerId: 'user-1', sellerId: 'user-1' },
      };
      mockPrisma.transactionMilestone.findMany.mockResolvedValue([sameUserMilestone]);

      const result = await makeService().sendDeadlineReminders();

      expect(mockNotifications.sendNotification).toHaveBeenCalledTimes(1);
      expect(result.sent).toBe(1);
    });

    it('respects buyer opt-out preference', async () => {
      mockCache.setNx.mockResolvedValue(true);
      mockPrisma.transactionMilestone.findMany.mockResolvedValue([mockMilestone]);
      mockPrisma.userPreferences.findUnique.mockImplementation(
        ({ where }: { where: { userId: string } }) =>
          where.userId === 'buyer-1' ? { optOutReminders: true } : null,
      );

      const result = await makeService().sendDeadlineReminders();

      expect(mockNotifications.sendNotification).toHaveBeenCalledTimes(1);
      expect(mockNotifications.sendNotification).toHaveBeenCalledWith(
        'seller-1',
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(Object),
      );
      expect(result.sent).toBe(1);
    });

    it('returns sent: 0 when no milestones are due', async () => {
      mockCache.setNx.mockResolvedValue(true);
      mockPrisma.transactionMilestone.findMany.mockResolvedValue([]);

      const result = await makeService().sendDeadlineReminders();

      expect(result.sent).toBe(0);
      expect(mockNotifications.sendNotification).not.toHaveBeenCalled();
    });
  });
});
