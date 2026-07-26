import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { AuthService } from '../../src/auth/auth.service';
import { PrismaService } from '../../src/database/prisma.service';
import { UsersService } from '../../src/users/users.service';
import { SessionsService } from '../../src/sessions/sessions.service';
import { EmailService } from '../../src/email/email.service';
import { LoginRateLimitService } from '../../src/auth/login-rate-limit.service';
import { FraudService } from '../../src/fraud/fraud.service';
import { createSha256 } from '../../src/auth/security.utils';

const ACCESS_SECRET = 'test-access-secret';
const REFRESH_SECRET = 'test-refresh-secret';

function signRefresh(payload: Record<string, any>) {
  const { exp, ...rest } = payload;
  return jwt.sign(rest, REFRESH_SECRET, {
    expiresIn: '7d',
    issuer: 'PropChain',
  });
}

function buildPayload(overrides: Partial<any> = {}) {
  return {
    sub: 'user-1',
    email: 'user@example.com',
    role: 'USER',
    type: 'refresh',
    jti: 'jti-original',
    family: 'family-1',
    ...overrides,
  };
}

describe('AuthService.refreshToken – token-reuse attack', () => {
  let service: AuthService;

  const mockPrisma = {
    blacklistedToken: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    session: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn((fns: any[]) => Promise.all(fns)),
  } as any;

  const mockUsersService = {} as any;
  const mockSessionsService = {
    createSession: jest.fn().mockResolvedValue({}),
  } as any;
  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, string> = {
        JWT_SECRET: ACCESS_SECRET,
        JWT_REFRESH_SECRET: REFRESH_SECRET,
        JWT_ACCESS_EXPIRES_IN: '15m',
        JWT_REFRESH_EXPIRES_IN: '7d',
        BCRYPT_ROUNDS: '4',
      };
      return config[key];
    }),
  } as ConfigService;
  const mockEmailService = {
    sendAccountLockedEmail: jest.fn().mockResolvedValue(undefined),
    sendEmail: jest.fn().mockResolvedValue(undefined),
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

    mockPrisma.blacklistedToken.findUnique.mockResolvedValue(null);
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      password: '$2b$04$hashed',
      role: 'USER',
      isBlocked: false,
      isDeactivated: false,
      isVerified: true,
      twoFactorEnabled: false,
    });

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

  it('issues new tokens on valid refresh (no reuse)', async () => {
    const payload = buildPayload({ jti: 'fresh-jti' });
    const token = signRefresh(payload);

    mockPrisma.blacklistedToken.findUnique.mockResolvedValue(null);

    const result = await service.refreshToken({ refreshToken: token }, '1.2.3.4', 'TestAgent');

    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();
    expect(mockPrisma.blacklistedToken.upsert).toHaveBeenCalled();
    expect(mockSessionsService.createSession).toHaveBeenCalled();
  });

  it('detects token reuse and throws + invalidates family', async () => {
    const payload = buildPayload({ jti: 'stolen-jti', family: 'family-stolen' });
    const token = signRefresh(payload);

    // Simulate the token being already blacklisted (reuse scenario)
    mockPrisma.blacklistedToken.findUnique.mockResolvedValue({
      jti: 'stolen-jti',
      tokenType: 'REFRESH',
      tokenFamily: 'family-stolen',
      userId: 'user-1',
      expiresAt: new Date(Date.now() + 3600000),
    });
    mockPrisma.blacklistedToken.update.mockResolvedValue({});
    mockPrisma.blacklistedToken.findMany.mockResolvedValue([
      { jti: 'stolen-jti' },
      { jti: 'family-jti-2' },
    ]);
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      isBlocked: false,
      isDeactivated: false,
    });

    await expect(
      service.refreshToken({ refreshToken: token }, '5.6.7.8', 'AttackerAgent'),
    ).rejects.toThrow(UnauthorizedException);

    // Fraud service should be notified
    expect(mockFraudService.handleTokenReuse).toHaveBeenCalledWith(
      'user-1',
      'stolen-jti',
      '5.6.7.8',
      'AttackerAgent',
    );

    // The reused token should be marked with reusedAt
    expect(mockPrisma.blacklistedToken.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { jti: 'stolen-jti' },
        data: expect.objectContaining({ reusedAt: expect.any(Date) }),
      }),
    );
  });

  it('rejects refresh if user is blocked', async () => {
    const payload = buildPayload({ jti: 'valid-jti' });
    const token = signRefresh(payload);

    mockPrisma.blacklistedToken.findUnique.mockResolvedValue(null);
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      isBlocked: true,
      isDeactivated: false,
    });

    await expect(
      service.refreshToken({ refreshToken: token }, '1.2.3.4', 'UA'),
    ).rejects.toThrow('blocked');
  });

  it('rejects refresh if user is deactivated', async () => {
    const payload = buildPayload({ jti: 'valid-jti-2' });
    const token = signRefresh(payload);

    mockPrisma.blacklistedToken.findUnique.mockResolvedValue(null);
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      isBlocked: false,
      isDeactivated: true,
    });

    await expect(
      service.refreshToken({ refreshToken: token }, '1.2.3.4', 'UA'),
    ).rejects.toThrow('deactivated');
  });

  it('rejects refresh if user no longer exists', async () => {
    const payload = buildPayload({ jti: 'orphan-jti' });
    const token = signRefresh(payload);

    mockPrisma.blacklistedToken.findUnique.mockResolvedValue(null);
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.refreshToken({ refreshToken: token }, '1.2.3.4', 'UA'),
    ).rejects.toThrow('no longer exists');
  });

  it('rejects a token that is not a refresh token', async () => {
    const accessPayload = { sub: 'user-1', email: 'user@example.com', role: 'USER', type: 'access', jti: 'access-jti' };
    const token = jwt.sign(accessPayload, REFRESH_SECRET, {
      expiresIn: '15m',
      issuer: 'PropChain',
    });

    await expect(
      service.refreshToken({ refreshToken: token }, '1.2.3.4', 'UA'),
    ).rejects.toThrow('Invalid refresh token');
  });

  it('rejects an invalid or expired token', async () => {
    const garbage = jwt.sign({ sub: 'x' }, 'wrong-secret');

    await expect(
      service.refreshToken({ refreshToken: garbage }, '1.2.3.4', 'UA'),
    ).rejects.toThrow();
  });

  it('logs and blocks entire token family on reuse', async () => {
    const payload = buildPayload({ jti: 'reused-jti', family: 'family-to-kill' });
    const token = signRefresh(payload);

    const existingBlacklist = {
      jti: 'reused-jti',
      tokenType: 'REFRESH',
      tokenFamily: 'family-to-kill',
      userId: 'user-1',
      ipAddress: '1.1.1.1',
      userAgent: 'LegitAgent',
      expiresAt: new Date(Date.now() + 3600000),
    };

    mockPrisma.blacklistedToken.findUnique.mockResolvedValue(existingBlacklist);
    mockPrisma.blacklistedToken.update.mockResolvedValue({});
    mockPrisma.blacklistedToken.findMany.mockResolvedValue([
      { jti: 'reused-jti' },
      { jti: 'family-jti-2' },
      { jti: 'family-jti-3' },
    ]);
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      isBlocked: false,
      isDeactivated: false,
    });

    await expect(
      service.refreshToken({ refreshToken: token }, '2.2.2.2', 'ThiefAgent'),
    ).rejects.toThrow(UnauthorizedException);

    // The reused JTI should have been queried for family tokens
    expect(mockPrisma.blacklistedToken.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tokenFamily: 'family-to-kill',
        }),
      }),
    );
  });
});
