import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { PrismaService } from '../database/prisma.service';
import { UsersService } from '../users/users.service';
import { SessionsService } from '../sessions/sessions.service';
import { EmailService } from '../email/email.service';
import { LoginRateLimitService } from './login-rate-limit.service';
import { FraudService } from '../fraud/fraud.service';
import { ApiKeyAnalyticsService } from './api-key-analytics.service';

describe('AuthService – CAPTCHA failure lockout', () => {
  let service: AuthService;

  const rateLimitService = {
    isAccountLocked: jest.fn(),
    getLockoutInfo: jest.fn(),
    getFailedAttemptsCount: jest.fn(),
    recordFailedAttempt: jest.fn(),
    recordSuccessfulAttempt: jest.fn(),
    unlockAccount: jest.fn(),
  };

  const usersService = {
    findByEmail: jest.fn(),
  };

  const sessionsService = {
    createSession: jest.fn(),
    revokeAllSessions: jest.fn(),
  };

  const emailService = {
    sendAccountLockedEmail: jest.fn(),
  };

  const fraudService = {
    evaluateFailedLogin: jest.fn(),
    evaluateSuccessfulLogin: jest.fn(),
    handleTokenReuse: jest.fn(),
  };

  const prisma = {
    user: { findUnique: jest.fn(), update: jest.fn() },
    loginHistory: { create: jest.fn() },
    blacklistedToken: { findUnique: jest.fn() },
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
        // No RECAPTCHA_SECRET → verifyCaptcha bypassed (returns true) unless we mock fetch
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: UsersService, useValue: usersService },
        { provide: SessionsService, useValue: sessionsService },
        { provide: EmailService, useValue: emailService },
        { provide: LoginRateLimitService, useValue: rateLimitService },
        { provide: FraudService, useValue: fraudService },
        {
          provide: ApiKeyAnalyticsService,
          useValue: { trackUsage: jest.fn(), getUsageStats: jest.fn() },
        },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  // Helper: make verifyCaptcha return false by setting a secret and mocking fetch
  function mockCaptchaFail() {
    const captchaConfig: Record<string, string> = {
      RECAPTCHA_SECRET: 'some-secret',
      CAPTCHA_THRESHOLD: '3',
      JWT_SECRET: 'test-secret-at-least-32-characters-long',
      JWT_REFRESH_SECRET: 'test-refresh-secret-at-least-32-characters-long',
      JWT_ACCESS_EXPIRES_IN: '15m',
      JWT_REFRESH_EXPIRES_IN: '7d',
      BCRYPT_ROUNDS: '10',
    };
    jest.spyOn(configService, 'get').mockImplementation((key: string) => captchaConfig[key] ?? '');

    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({ success: false, 'error-codes': ['invalid-input-response'] }),
    }) as unknown as typeof fetch;
  }

  describe('CAPTCHA failure', () => {
    beforeEach(() => {
      rateLimitService.isAccountLocked.mockResolvedValue(false);
      rateLimitService.getFailedAttemptsCount.mockResolvedValue(3); // at threshold
      rateLimitService.recordFailedAttempt.mockResolvedValue(false);
    });

    it('calls recordFailedAttempt when verifyCaptcha returns false', async () => {
      mockCaptchaFail();

      await expect(
        service.login({ email: 'user@example.com', password: 'pass', captchaToken: 'bad-token' }),
      ).rejects.toThrow(UnauthorizedException);

      expect(rateLimitService.recordFailedAttempt).toHaveBeenCalledTimes(1);
      expect(rateLimitService.recordFailedAttempt).toHaveBeenCalledWith(
        'user@example.com',
        undefined,
        undefined,
      );
    });

    it('throws UnauthorizedException with "Invalid CAPTCHA" message', async () => {
      mockCaptchaFail();

      await expect(
        service.login({ email: 'user@example.com', password: 'pass', captchaToken: 'bad-token' }),
      ).rejects.toThrow('Invalid CAPTCHA');
    });

    it('records exactly one failed attempt per bad CAPTCHA request', async () => {
      mockCaptchaFail();

      await expect(
        service.login({ email: 'user@example.com', password: 'pass', captchaToken: 'bad' }),
      ).rejects.toThrow(UnauthorizedException);

      expect(rateLimitService.recordFailedAttempt).toHaveBeenCalledTimes(1);
    });
  });

  describe('lockout progression via CAPTCHA failures', () => {
    it('triggers lockout after repeated CAPTCHA failures', async () => {
      mockCaptchaFail();
      rateLimitService.isAccountLocked
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);
      rateLimitService.getFailedAttemptsCount.mockResolvedValue(3);
      // Third call to recordFailedAttempt returns true (should lock)
      rateLimitService.recordFailedAttempt.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
      rateLimitService.getLockoutInfo.mockResolvedValue({
        isLocked: true,
        remainingLockoutMinutes: 30,
      });

      const loginArgs = {
        email: 'user@example.com',
        password: 'pass',
        captchaToken: 'bad',
      };

      // First two fail with CAPTCHA error
      await expect(service.login(loginArgs)).rejects.toThrow('Invalid CAPTCHA');
      await expect(service.login(loginArgs)).rejects.toThrow('Invalid CAPTCHA');

      // Third attempt: account is now locked
      await expect(service.login(loginArgs)).rejects.toThrow(/locked/i);

      expect(rateLimitService.recordFailedAttempt).toHaveBeenCalledTimes(2);
    });
  });

  describe('5 CAPTCHA failures trigger account lockout', () => {
    it('locks account after 5 invalid CAPTCHA submissions', async () => {
      mockCaptchaFail();
      rateLimitService.isAccountLocked
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false);

      rateLimitService.getFailedAttemptsCount.mockResolvedValue(3);

      let callCount = 0;
      rateLimitService.recordFailedAttempt.mockImplementation(async () => {
        callCount++;
        // After 5th failed attempt, the account is considered locked
        if (callCount >= 5) {
          rateLimitService.isAccountLocked.mockResolvedValue(true);
          rateLimitService.getLockoutInfo.mockResolvedValue({
            isLocked: true,
            remainingLockoutMinutes: 30,
          });
          return true;
        }
        return false;
      });

      const loginArgs = {
        email: 'user@example.com',
        password: 'pass',
        captchaToken: 'bad',
      };

      // First 5 attempts fail with "Invalid CAPTCHA"
      for (let i = 0; i < 5; i++) {
        await expect(service.login(loginArgs)).rejects.toThrow('Invalid CAPTCHA');
      }

      // 6th attempt: account is locked
      await expect(service.login(loginArgs)).rejects.toThrow(/locked/i);

      expect(rateLimitService.recordFailedAttempt).toHaveBeenCalledTimes(5);
    });
  });

  describe('password failure (unchanged behavior)', () => {
    it('still records a failed attempt on wrong password', async () => {
      rateLimitService.isAccountLocked.mockResolvedValue(false);
      rateLimitService.getFailedAttemptsCount.mockResolvedValue(0); // below threshold
      rateLimitService.recordFailedAttempt.mockResolvedValue(false);
      fraudService.evaluateFailedLogin.mockResolvedValue(undefined);

      usersService.findByEmail.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        password: '$2b$10$invalidhash',
        isBlocked: false,
        isDeactivated: false,
        isVerified: true,
        twoFactorEnabled: false,
      });

      await expect(
        service.login({ email: 'user@example.com', password: 'wrongpass' }),
      ).rejects.toThrow('Invalid credentials');

      expect(rateLimitService.recordFailedAttempt).toHaveBeenCalledTimes(1);
    });
  });

  describe('successful login', () => {
    it('does not increment failed attempts on valid credentials', async () => {
      rateLimitService.isAccountLocked.mockResolvedValue(false);
      rateLimitService.getFailedAttemptsCount.mockResolvedValue(0);
      rateLimitService.recordSuccessfulAttempt.mockResolvedValue(undefined);
      fraudService.evaluateSuccessfulLogin.mockResolvedValue(undefined);

      const { hashPassword } = await import('./security.utils');
      const hash = await hashPassword('correctpass', 10);

      const fakeUser = {
        id: 'user-1',
        email: 'user@example.com',
        password: hash,
        isBlocked: false,
        isDeactivated: false,
        twoFactorEnabled: false,
        role: 'USER',
        firstName: 'Test',
        lastName: 'User',
        phone: null,
        avatar: null,
        isVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      usersService.findByEmail.mockResolvedValue(fakeUser);
      prisma.user.findUnique.mockResolvedValue(fakeUser);
      prisma.loginHistory.create.mockResolvedValue({});
      sessionsService.createSession.mockResolvedValue({});

      await service.login({ email: 'user@example.com', password: 'correctpass' });

      expect(rateLimitService.recordFailedAttempt).not.toHaveBeenCalled();
      expect(rateLimitService.recordSuccessfulAttempt).toHaveBeenCalledTimes(1);
    });
  });
});
