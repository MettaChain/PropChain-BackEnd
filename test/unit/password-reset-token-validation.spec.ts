import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../../src/auth/auth.service';
import { PrismaService } from '../../src/database/prisma.service';
import { UsersService } from '../../src/users/users.service';
import { SessionsService } from '../../src/sessions/sessions.service';
import { EmailService } from '../../src/email/email.service';
import { LoginRateLimitService } from '../../src/auth/login-rate-limit.service';
import { FraudService } from '../../src/fraud/fraud.service';
import { createSha256 } from '../../src/auth/security.utils';

describe('AuthService.resetPassword – password-reset token validation', () => {
  let service: AuthService;

  const VALID_TOKEN = 'valid-reset-token-abc123';
  const VALID_TOKEN_HASH = createSha256(VALID_TOKEN);
  const EXPIRED_TOKEN = 'expired-reset-token-xyz';
  const EXPIRED_TOKEN_HASH = createSha256(EXPIRED_TOKEN);
  const USED_TOKEN = 'used-reset-token-def456';
  const USED_TOKEN_HASH = createSha256(USED_TOKEN);

  const now = new Date();
  const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  const resetTokens = new Map<string, any>();
  const passwordHistory: any[] = [];

  const mockPrisma = {
    passwordResetToken: {
      findUnique: jest.fn(async ({ where }: any) => {
        return resetTokens.get(where.token) ?? null;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const record = resetTokens.get(where.id);
        if (record) Object.assign(record, data);
        return record;
      }),
      updateMany: jest.fn(async () => ({ count: 1 })),
      create: jest.fn(async ({ data }: any) => {
        const id = Math.random().toString(36).slice(2, 8);
        const record = { id, ...data, createdAt: new Date() };
        resetTokens.set(data.token, record);
        return record;
      }),
    },
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    passwordHistory: {
      findMany: jest.fn(async ({ where }: any) => {
        return passwordHistory.filter((h) => h.userId === where.userId);
      }),
      create: jest.fn(async ({ data }: any) => {
        const record = {
          id: Math.random().toString(36).slice(2, 8),
          ...data,
          createdAt: new Date(),
        };
        passwordHistory.push(record);
        return record;
      }),
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
    session: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    blacklistedToken: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn(async (fnOrArray: any) => {
      if (typeof fnOrArray === 'function') {
        return fnOrArray(mockPrisma);
      }
      const results = [];
      for (const fn of fnOrArray) {
        results.push(await fn);
      }
      return results;
    }),
  } as any;

  const mockUsersService = {} as any;
  const mockSessionsService = {
    revokeAllSessions: jest.fn().mockResolvedValue(undefined),
    createSession: jest.fn().mockResolvedValue({}),
  } as any;
  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, string> = {
        JWT_SECRET: 'test-access-secret-at-least-32-characters-long',
        JWT_REFRESH_SECRET: 'test-refresh-secret-at-least-32-characters-long',
        JWT_ACCESS_EXPIRES_IN: '15m',
        JWT_REFRESH_EXPIRES_IN: '7d',
        BCRYPT_ROUNDS: '4',
        PASSWORD_HISTORY_LIMIT: '5',
      };
      return config[key];
    }),
  } as ConfigService;
  const mockEmailService = {
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    sendEmail: jest.fn().mockResolvedValue(undefined),
    sendAccountLockedEmail: jest.fn().mockResolvedValue(undefined),
  } as any;
  const mockRateLimitService = {
    isAccountLocked: jest.fn().mockResolvedValue(false),
    getFailedAttemptsCount: jest.fn().mockResolvedValue(0),
    recordFailedAttempt: jest.fn(),
    recordSuccessfulAttempt: jest.fn(),
    getLockoutInfo: jest.fn(),
    unlockAccount: jest.fn(),
  } as any;
  const mockFraudService = {
    handleTokenReuse: jest.fn().mockResolvedValue(undefined),
    evaluateFailedLogin: jest.fn().mockResolvedValue(null),
    evaluateSuccessfulLogin: jest.fn().mockResolvedValue([]),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    resetTokens.clear();
    passwordHistory.length = 0;

    // Seed a valid reset token
    resetTokens.set(VALID_TOKEN_HASH, {
      id: 'token-valid',
      token: VALID_TOKEN_HASH,
      userId: 'user-1',
      expiresAt: oneHourLater,
      usedAt: null,
      user: {
        id: 'user-1',
        isBlocked: false,
        email: 'user@example.com',
      },
    });

    // Seed an expired reset token
    resetTokens.set(EXPIRED_TOKEN_HASH, {
      id: 'token-expired',
      token: EXPIRED_TOKEN_HASH,
      userId: 'user-1',
      expiresAt: oneHourAgo,
      usedAt: null,
      user: {
        id: 'user-1',
        isBlocked: false,
        email: 'user@example.com',
      },
    });

    // Seed a used reset token
    resetTokens.set(USED_TOKEN_HASH, {
      id: 'token-used',
      token: USED_TOKEN_HASH,
      userId: 'user-1',
      expiresAt: oneHourLater,
      usedAt: new Date(now.getTime() - 30 * 60 * 1000),
      user: {
        id: 'user-1',
        isBlocked: false,
        email: 'user@example.com',
      },
    });

    mockPrisma.user.update.mockImplementation(async ({ where, data }) => ({
      id: where.id,
      ...data,
    }));

    service = new AuthService(
      mockPrisma,
      mockUsersService,
      mockSessionsService,
      mockConfigService,
      mockEmailService,
      mockRateLimitService,
      mockFraudService,
    );
  });

  it('accepts a valid, unused, non-expired token', async () => {
    await expect(
      service.resetPassword({ token: VALID_TOKEN, newPassword: 'NewP@ssw0rd!' }),
    ).resolves.toBeUndefined();

    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: expect.objectContaining({ password: expect.any(String) }),
      }),
    );
    expect(mockPrisma.passwordResetToken.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'token-valid' },
        data: expect.objectContaining({ usedAt: expect.any(Date) }),
      }),
    );
    expect(mockSessionsService.revokeAllSessions).toHaveBeenCalledWith('user-1');
  });

  it('rejects an invalid (non-existent) token', async () => {
    await expect(
      service.resetPassword({
        token: 'totally-bogus-token',
        newPassword: 'NewP@ssw0rd!',
      }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.resetPassword({
        token: 'totally-bogus-token',
        newPassword: 'NewP@ssw0rd!',
      }),
    ).rejects.toThrow('Invalid or expired reset token');
  });

  it('rejects an expired token', async () => {
    await expect(
      service.resetPassword({
        token: EXPIRED_TOKEN,
        newPassword: 'NewP@ssw0rd!',
      }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.resetPassword({
        token: EXPIRED_TOKEN,
        newPassword: 'NewP@ssw0rd!',
      }),
    ).rejects.toThrow('expired');
  });

  it('rejects a token that has already been used (double-use prevention)', async () => {
    await expect(
      service.resetPassword({
        token: USED_TOKEN,
        newPassword: 'NewP@ssw0rd!',
      }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.resetPassword({
        token: USED_TOKEN,
        newPassword: 'NewP@ssw0rd!',
      }),
    ).rejects.toThrow('already been used');
  });

  it('rejects if the account is blocked', async () => {
    const blockedToken = 'blocked-reset-token';
    const blockedHash = createSha256(blockedToken);

    resetTokens.set(blockedHash, {
      id: 'token-blocked',
      token: blockedHash,
      userId: 'user-blocked',
      expiresAt: oneHourLater,
      usedAt: null,
      user: {
        id: 'user-blocked',
        isBlocked: true,
        email: 'blocked@example.com',
      },
    });

    await expect(
      service.resetPassword({
        token: blockedToken,
        newPassword: 'NewP@ssw0rd!',
      }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.resetPassword({
        token: blockedToken,
        newPassword: 'NewP@ssw0rd!',
      }),
    ).rejects.toThrow('blocked');
  });

  it('rejects a weak password that does not meet policy', async () => {
    await expect(
      service.resetPassword({
        token: VALID_TOKEN,
        newPassword: 'weak',
      }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.resetPassword({
        token: VALID_TOKEN,
        newPassword: 'weak',
      }),
    ).rejects.toThrow('complexity requirements');
  });

  it('rejects password reuse against recent history', async () => {
    const reusedPasswordHash = await (
      await import('../../src/auth/security.utils')
    ).hashPassword('ReusedP@ss1!', 4);

    passwordHistory.push({
      id: 'hist-1',
      userId: 'user-1',
      passwordHash: reusedPasswordHash,
      createdAt: new Date(),
    });

    await expect(
      service.resetPassword({
        token: VALID_TOKEN,
        newPassword: 'ReusedP@ss1!',
      }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.resetPassword({
        token: VALID_TOKEN,
        newPassword: 'ReusedP@ss1!',
      }),
    ).rejects.toThrow('reuse is not allowed');
  });

  it('marks token as used and updates password in a single transaction', async () => {
    await service.resetPassword({
      token: VALID_TOKEN,
      newPassword: 'BrandNewP@ss1!',
    });

    expect(mockPrisma.$transaction).toHaveBeenCalled();
    expect(mockPrisma.passwordResetToken.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'token-valid' },
        data: expect.objectContaining({ usedAt: expect.any(Date) }),
      }),
    );
    expect(mockPrisma.passwordHistory.create).toHaveBeenCalled();
  });
});
