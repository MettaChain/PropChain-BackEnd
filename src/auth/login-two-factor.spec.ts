import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { AuthService } from './auth.service';
import { TwoFactorService } from './two-factor.service';
import { PrismaService } from '../database/prisma.service';
import { UsersService } from '../users/users.service';
import { SessionsService } from '../sessions/sessions.service';
import { EmailService } from '../email/email.service';
import { LoginRateLimitService } from './login-rate-limit.service';
import { FraudService } from '../fraud/fraud.service';
import { ApiKeyAnalyticsService } from './api-key-analytics.service';
import { LoginDto } from './dto/auth.dto';
import { createSha256, generateTotpCode, hashPassword } from './security.utils';

/**
 * End-to-end style coverage for the two-factor login lifecycle added by #1291:
 * enrollment, the login challenge (TOTP, recovery codes and trusted devices),
 * and remembering a device after a successful challenge.
 */
describe('AuthService - two-factor login lifecycle (#1291)', () => {
  let service: AuthService;
  let passwordHash: string;

  const confirmedPassword = 'CorrectHorse1!';

  const prisma = {
    user: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue(undefined) },
    blacklistedToken: { findUnique: jest.fn().mockResolvedValue(null) },
    loginHistory: { create: jest.fn().mockResolvedValue(undefined) },
    activityLog: { create: jest.fn().mockResolvedValue(undefined) },
  };

  const usersService = {
    findByEmail: jest.fn(),
  };

  const sessionsService = {
    createSession: jest.fn().mockResolvedValue(undefined),
  };

  const rateLimitService = {
    isAccountLocked: jest.fn().mockResolvedValue(false),
    getLockoutInfo: jest.fn().mockResolvedValue(null),
    getFailedAttemptsCount: jest.fn().mockResolvedValue(0),
    recordFailedAttempt: jest.fn().mockResolvedValue(false),
    recordSuccessfulAttempt: jest.fn().mockResolvedValue(undefined),
  };

  const fraudService = {
    evaluateSuccessfulLogin: jest.fn().mockResolvedValue(undefined),
    evaluateFailedLogin: jest.fn().mockResolvedValue(undefined),
    recordLoginContext: jest.fn().mockResolvedValue(undefined),
  };

  const emailService = {
    sendAccountLockedEmail: jest.fn().mockResolvedValue(undefined),
  };

  const twoFactorService = {
    isTrustedDevice: jest.fn().mockResolvedValue(false),
    rememberDevice: jest.fn(),
    revokeAllDevices: jest.fn().mockResolvedValue(0),
  };

  const configService = {
    get: jest.fn((key: string) => {
      const config: Record<string, string> = {
        JWT_SECRET: 'test-secret-at-least-32-characters-long',
        JWT_REFRESH_SECRET: 'test-refresh-secret-at-least-32-characters-long',
        JWT_ACCESS_EXPIRES_IN: '15m',
        JWT_REFRESH_EXPIRES_IN: '7d',
        BCRYPT_ROUNDS: '10',
        CAPTCHA_THRESHOLD: '3',
      };
      return config[key];
    }),
  };

  const buildUser = (overrides: Record<string, unknown> = {}) => ({
    id: 'user-1',
    email: 'user@test.com',
    password: passwordHash,
    role: 'AGENT',
    tier: 'PREMIUM',
    isBlocked: false,
    isDeactivated: false,
    isVerified: true,
    twoFactorEnabled: false,
    twoFactorSecret: null as string | null,
    twoFactorBackupCodes: null as string[] | null,
    ...overrides,
  });

  const loginDto = (overrides: Partial<LoginDto> = {}): LoginDto =>
    ({ email: 'user@test.com', password: confirmedPassword, ...overrides }) as LoginDto;

  beforeAll(async () => {
    passwordHash = await hashPassword(confirmedPassword, 10);
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    rateLimitService.isAccountLocked.mockResolvedValue(false);
    rateLimitService.getFailedAttemptsCount.mockResolvedValue(0);
    rateLimitService.recordFailedAttempt.mockResolvedValue(false);
    prisma.blacklistedToken.findUnique.mockResolvedValue(null);
    twoFactorService.isTrustedDevice.mockResolvedValue(false);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: UsersService, useValue: usersService },
        { provide: SessionsService, useValue: sessionsService },
        { provide: EmailService, useValue: emailService },
        { provide: LoginRateLimitService, useValue: rateLimitService },
        { provide: FraudService, useValue: fraudService },
        { provide: ConfigService, useValue: configService },
        { provide: TwoFactorService, useValue: twoFactorService },
        {
          provide: ApiKeyAnalyticsService,
          useValue: { checkQuota: jest.fn(), recordUsage: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  const mockLoginUser = (overrides: Record<string, unknown> = {}) => {
    const user = buildUser(overrides);
    usersService.findByEmail.mockResolvedValue(user);
    prisma.user.findUnique.mockResolvedValue(user);
    return user;
  };

  describe('enrollment', () => {
    it('issues a secret, QR URL and recovery codes without enabling 2FA yet', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser());

      const result = await service.setupTwoFactor({ sub: 'user-1' } as any);

      expect(result.secret).toEqual(expect.any(String));
      expect(result.otpAuthUrl).toContain(`secret=${result.secret}`);
      expect(result.qrCodeUrl).toContain(encodeURIComponent(result.otpAuthUrl));
      expect(result.backupCodes).toHaveLength(8);

      const updateArgs = prisma.user.update.mock.calls[0][0];
      expect(updateArgs.data.twoFactorEnabled).toBe(false);
      expect(updateArgs.data.twoFactorSecret).toBe(result.secret);
      expect(updateArgs.data.twoFactorBackupCodes.set).toHaveLength(8);
      // Only hashes are persisted – never the plaintext recovery codes.
      expect(updateArgs.data.twoFactorBackupCodes.set).not.toContain(result.backupCodes[0]);
    });

    it('enables 2FA once a valid TOTP code is supplied', async () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      prisma.user.findUnique.mockResolvedValue(buildUser({ twoFactorSecret: secret }));

      const code = generateTotpCode({ secret });
      const result = await service.verifyTwoFactor({ sub: 'user-1' } as any, { code });

      expect(result.message).toMatch(/enabled/i);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { twoFactorEnabled: true },
      });
    });

    it('refuses to enable 2FA when enrollment was never initialised', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser({ twoFactorSecret: null }));

      await expect(
        service.verifyTwoFactor({ sub: 'user-1' } as any, { code: '123456' }),
      ).rejects.toThrow(/not been initialized/i);
    });
  });

  describe('login challenge', () => {
    it('requires a second factor when 2FA is enabled and none is supplied', async () => {
      mockLoginUser({ twoFactorEnabled: true, twoFactorSecret: 'JBSWY3DPEHPK3PXP' });

      await expect(service.login(loginDto())).rejects.toThrow(/code required/i);
      expect(sessionsService.createSession).not.toHaveBeenCalled();
    });

    it('rejects an invalid TOTP code', async () => {
      mockLoginUser({ twoFactorEnabled: true, twoFactorSecret: 'JBSWY3DPEHPK3PXP' });

      await expect(service.login(loginDto({ totpCode: '000000' }))).rejects.toThrow(
        /invalid two-factor authentication code/i,
      );
    });

    it('accepts a valid TOTP code and issues a token pair', async () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      mockLoginUser({ twoFactorEnabled: true, twoFactorSecret: secret });

      const result = await service.login(loginDto({ totpCode: generateTotpCode({ secret }) }));

      expect(result.accessToken).toEqual(expect.any(String));
      const claims = jwt.decode(result.accessToken) as any;
      expect(claims.sub).toBe('user-1');
      expect(sessionsService.createSession).toHaveBeenCalled();
    });

    it('consumes a valid recovery code exactly once', async () => {
      const recoveryCode = 'ABCD1234';
      const otherCode = 'EFGH5678';
      mockLoginUser({
        twoFactorEnabled: true,
        twoFactorSecret: 'JBSWY3DPEHPK3PXP',
        twoFactorBackupCodes: [createSha256(recoveryCode), createSha256(otherCode)],
      });

      const result = await service.login(loginDto({ backupCode: recoveryCode }));
      expect(result.accessToken).toEqual(expect.any(String));

      const updateArgs = prisma.user.update.mock.calls[0][0];
      expect(updateArgs.data.twoFactorBackupCodes.set).toEqual([createSha256(otherCode)]);
    });

    it('rejects an unknown recovery code', async () => {
      mockLoginUser({
        twoFactorEnabled: true,
        twoFactorSecret: 'JBSWY3DPEHPK3PXP',
        twoFactorBackupCodes: [createSha256('ABCD1234')],
      });

      await expect(service.login(loginDto({ backupCode: 'NOPE0000' }))).rejects.toThrow(
        /invalid backup code/i,
      );
    });
  });

  describe('trusted devices', () => {
    it('lets a remembered device skip the challenge entirely', async () => {
      mockLoginUser({ twoFactorEnabled: true, twoFactorSecret: 'JBSWY3DPEHPK3PXP' });
      twoFactorService.isTrustedDevice.mockResolvedValue(true);

      const result = await service.login(loginDto({ trustedDeviceToken: 'device-token' }));

      expect(twoFactorService.isTrustedDevice).toHaveBeenCalledWith('user-1', 'device-token');
      expect(result.accessToken).toEqual(expect.any(String));
    });

    it('still challenges when the supplied device token is not trusted', async () => {
      mockLoginUser({ twoFactorEnabled: true, twoFactorSecret: 'JBSWY3DPEHPK3PXP' });
      twoFactorService.isTrustedDevice.mockResolvedValue(false);

      await expect(service.login(loginDto({ trustedDeviceToken: 'stale-token' }))).rejects.toThrow(
        /code required/i,
      );
    });

    it('issues a one-time device token when rememberDevice is requested', async () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      mockLoginUser({ twoFactorEnabled: true, twoFactorSecret: secret });
      const expiresAt = new Date(Date.now() + 86_400_000);
      twoFactorService.rememberDevice.mockResolvedValue({
        token: 'fresh-device-token',
        device: { expiresAt },
      });

      const result = await service.login(
        loginDto({ totpCode: generateTotpCode({ secret }), rememberDevice: true }),
        '203.0.113.10',
        'jest-agent',
      );

      expect(twoFactorService.rememberDevice).toHaveBeenCalledWith('user-1', {
        userAgent: 'jest-agent',
        ipAddress: '203.0.113.10',
      });
      expect((result as any).trustedDeviceToken).toBe('fresh-device-token');
      expect((result as any).trustedDeviceExpiresAt).toBe(expiresAt);
    });

    it('does not remember a device when the second factor was skipped', async () => {
      mockLoginUser({ twoFactorEnabled: true, twoFactorSecret: 'JBSWY3DPEHPK3PXP' });
      twoFactorService.isTrustedDevice.mockResolvedValue(true);

      await service.login(loginDto({ trustedDeviceToken: 'device-token', rememberDevice: true }));

      expect(twoFactorService.rememberDevice).not.toHaveBeenCalled();
    });
  });
});
