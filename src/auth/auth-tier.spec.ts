import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { AuthService } from './auth.service';
import { PrismaService } from '../database/prisma.service';
import { UsersService } from '../users/users.service';
import { SessionsService } from '../sessions/sessions.service';
import { EmailService } from '../email/email.service';
import { LoginRateLimitService } from './login-rate-limit.service';
import { FraudService } from '../fraud/fraud.service';
import { ApiKeyAnalyticsService } from './api-key-analytics.service';

describe('AuthService - tier propagation', () => {
  let service: AuthService;

  const sessionsService = {
    createSession: jest.fn().mockResolvedValue(undefined),
  };

  const prisma = {
    user: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue(undefined) },
    apiKey: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue(undefined) },
    blacklistedToken: { findUnique: jest.fn().mockResolvedValue(null) },
  };

  const configService = {
    get: jest.fn((key: string) => {
      const config: Record<string, string> = {
        JWT_SECRET: 'test-secret-at-least-32-characters-long',
        JWT_REFRESH_SECRET: 'test-refresh-secret-at-least-32-characters-long',
        JWT_ACCESS_EXPIRES_IN: '15m',
        JWT_REFRESH_EXPIRES_IN: '7d',
        BCRYPT_ROUNDS: '10',
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.user.update.mockResolvedValue(undefined);
    prisma.apiKey.update.mockResolvedValue(undefined);
    prisma.blacklistedToken.findUnique.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: UsersService, useValue: {} },
        { provide: SessionsService, useValue: sessionsService },
        { provide: EmailService, useValue: {} },
        { provide: LoginRateLimitService, useValue: {} },
        { provide: FraudService, useValue: {} },
        { provide: ConfigService, useValue: configService },
        {
          provide: ApiKeyAnalyticsService,
          useValue: {
            checkQuota: jest.fn().mockResolvedValue(undefined),
            recordUsage: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('issueTokenPair', () => {
    it('includes tier in both the access and refresh token claims', async () => {
      const user = {
        id: 'user-1',
        email: 'user@test.com',
        role: 'AGENT',
        tier: 'PREMIUM',
      } as any;

      const tokens = await service.issueTokenPair(user);

      const accessClaims = jwt.decode(tokens.accessToken) as any;
      const refreshClaims = jwt.decode(tokens.refreshToken) as any;

      expect(accessClaims.tier).toBe('PREMIUM');
      expect(accessClaims.role).toBe('AGENT');
      expect(refreshClaims.tier).toBe('PREMIUM');
    });
  });

  describe('validateAccessToken', () => {
    it('returns the tier read fresh from the database, not from the token', async () => {
      const token = jwt.sign(
        {
          sub: 'user-1',
          email: 'user@test.com',
          role: 'FREE',
          tier: 'FREE',
          type: 'access',
          jti: 'jti-1',
        },
        'test-secret-at-least-32-characters-long',
        { expiresIn: '15m', issuer: 'PropChain' },
      );

      // DB now reports a different (upgraded) tier than what was baked into the token
      prisma.user.findUnique.mockResolvedValue({
        email: 'user@test.com',
        role: 'USER',
        tier: 'ENTERPRISE',
        lastActivityAt: new Date(),
      });

      const result = await service.validateAccessToken(token);

      expect(result.tier).toBe('ENTERPRISE');
      expect(result.sub).toBe('user-1');
    });
  });

  describe('validateApiKey', () => {
    it('surfaces the owning user tier on the api-key payload', async () => {
      prisma.apiKey.findUnique.mockResolvedValue({
        id: 'key-1',
        userId: 'user-1',
        revokedAt: null,
        expiresAt: null,
        permissions: ['read'],
        user: {
          email: 'user@test.com',
          role: 'AGENT',
          tier: 'ENTERPRISE',
          isBlocked: false,
        },
      });

      const result = await service.validateApiKey('raw-api-key-value');

      expect(result.tier).toBe('ENTERPRISE');
      expect(result.type).toBe('api-key');
      expect(result.apiKeyId).toBe('key-1');
    });
  });
});
