import { AccountDeletionService } from './account-deletion.service';
import { I18nService } from '../i18n/i18n.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

const baseUser = {
  id: 'user-1',
  email: 'u@example.com',
  firstName: 'Ada',
  legalHold: false,
  isDeactivated: false,
  scheduledDeletionAt: null,
  deactivatedAt: null,
  deletionReason: null,
};

function buildHarness({
  user = baseUser,
  prismaUserUpdate = jest
    .fn()
    .mockImplementation((args: any) => Promise.resolve({ ...baseUser, ...args.data })),
  prismaAccountDeletionAuditCreate = jest.fn().mockResolvedValue({ id: 'audit-1' }),
  prismaUserDelete = jest.fn().mockResolvedValue(baseUser),
  retentionDaysEnv,
}: Partial<{
  user: any;
  prismaUserUpdate: jest.Mock;
  prismaAccountDeletionAuditCreate: jest.Mock;
  prismaUserDelete: jest.Mock;
  retentionDaysEnv: number;
}> = {}) {
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue(user),
      findMany: jest.fn().mockResolvedValue([]),
      update: prismaUserUpdate,
      delete: prismaUserDelete,
    },
    accountDeletionAudit: {
      create: prismaAccountDeletionAuditCreate,
    },
  } as any;

  const email = {
    sendEmail: jest.fn().mockResolvedValue({ id: 'msg-1' }),
  } as any;

  const configValues: Record<string, any> = {};
  if (typeof retentionDaysEnv === 'number') {
    configValues.ACCOUNT_DELETION_RETENTION_DAYS = retentionDaysEnv;
  }

  const config = {
    get: jest.fn((key: string) => configValues[key]),
  } as any;

  const i18n = new I18nService();
  const service = new AccountDeletionService(prisma, email, i18n, config);
  return {
    service,
    prisma,
    email,
    config,
    i18n,
    prismaUserUpdate,
    prismaAccountDeletionAuditCreate,
  };
}

describe('AccountDeletionService', () => {
  describe('getDefaultRetentionDays / resolveRetentionDays', () => {
    it('falls back to 30 days when env is unset', () => {
      const { service } = buildHarness();
      expect(service.getDefaultRetentionDays()).toBe(30);
    });

    it('clamps runtime retention to [7, 90]', () => {
      const { service } = buildHarness();
      expect(service.resolveRetentionDays(0)).toBe(7);
      expect(service.resolveRetentionDays(3)).toBe(7);
      expect(service.resolveRetentionDays(15)).toBe(15);
      expect(service.resolveRetentionDays(365)).toBe(90);
      expect(service.resolveRetentionDays(undefined)).toBe(30);
    });

    it('reads ACCOUNT_DELETION_RETENTION_DAYS env when valid', () => {
      const { service } = buildHarness({ retentionDaysEnv: 14 });
      expect(service.getDefaultRetentionDays()).toBe(14);
    });
  });

  describe('requestDeletion', () => {
    it('rejects users under legal hold and writes a blocked-audit entry', async () => {
      const { service, prismaAccountDeletionAuditCreate } = buildHarness({
        user: { ...baseUser, legalHold: true },
      });
      await expect(service.requestDeletion({ userId: 'user-1' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prismaAccountDeletionAuditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'LEGAL_HOLD_BLOCKED' }),
        }),
      );
    });

    it('rejects when a deletion is already pending', async () => {
      const { service } = buildHarness({
        user: {
          ...baseUser,
          isDeactivated: true,
          scheduledDeletionAt: new Date(Date.now() + 86_400_000),
        },
      });
      await expect(service.requestDeletion({ userId: 'user-1' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws NotFound for unknown users', async () => {
      const { service, prisma } = buildHarness();
      prisma.user.findUnique.mockResolvedValueOnce(null);
      await expect(service.requestDeletion({ userId: 'ghost' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('marks the user deactivated and writes the audit trail', async () => {
      const { service, prismaUserUpdate, prismaAccountDeletionAuditCreate } = buildHarness();
      const result = await service.requestDeletion({
        userId: 'user-1',
        retentionDays: 21,
        reason: 'no longer needed',
      });
      expect(result.isDeactivated).toBe(true);
      expect(result.retentionDays).toBe(21);
      expect(prismaUserUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({
            isDeactivated: true,
            deletionReason: 'no longer needed',
          }),
        }),
      );
      const actions = prismaAccountDeletionAuditCreate.mock.calls.map(
        (call) => (call[0] as any).data.action,
      );
      expect(actions).toContain('REQUESTED');
    });
  });

  describe('cancelDeletion', () => {
    it('rejects when no deletion request is open', async () => {
      const { service } = buildHarness();
      await expect(service.cancelDeletion({ userId: 'user-1' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects when scheduledDeletionAt has already elapsed', async () => {
      const { service } = buildHarness({
        user: {
          ...baseUser,
          isDeactivated: true,
          scheduledDeletionAt: new Date(Date.now() - 1_000),
        },
      });
      await expect(service.cancelDeletion({ userId: 'user-1' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('reverses the deactivation and writes a CANCELLED audit entry', async () => {
      const { service, prismaUserUpdate, prismaAccountDeletionAuditCreate } = buildHarness({
        user: {
          ...baseUser,
          isDeactivated: true,
          scheduledDeletionAt: new Date(Date.now() + 86_400_000),
        },
      });
      const result = await service.cancelDeletion({ userId: 'user-1' });
      expect(result.isDeactivated).toBe(false);
      expect(prismaUserUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isDeactivated: false,
            scheduledDeletionAt: null,
          }),
        }),
      );
      const actions = prismaAccountDeletionAuditCreate.mock.calls.map(
        (call) => (call[0] as any).data.action,
      );
      expect(actions).toContain('CANCELLED');
    });
  });

  describe('performScheduledDeletion', () => {
    it('skips users on legal hold and counts them as blocked', async () => {
      const { service, prisma, prismaAccountDeletionAuditCreate } = buildHarness();
      prisma.user.findMany.mockResolvedValueOnce([
        { id: 'hold', email: 'a@b', legalHold: true },
        { id: 'clean', email: 'c@d', legalHold: false },
      ]);
      const result = await service.performScheduledDeletion(new Date());
      expect(result.deletedCount).toBe(1);
      expect(result.blockedByLegalHold).toBe(1);
      expect(prisma.user.delete).toHaveBeenCalledTimes(1);
      expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'clean' } });
      const actions = prismaAccountDeletionAuditCreate.mock.calls.map(
        (call) => (call[0] as any).data.action,
      );
      expect(actions).toEqual(expect.arrayContaining(['LEGAL_HOLD_BLOCKED', 'PERFORMED']));
    });

    it('returns zeros when no candidates match', async () => {
      const { service } = buildHarness();
      const result = await service.performScheduledDeletion(new Date());
      expect(result).toEqual({ deletedCount: 0, blockedByLegalHold: 0 });
    });
  });
});
