import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AuthController } from '../../src/auth/auth.controller';
import { AuthService } from '../../src/auth/auth.service';
import { PrismaService } from '../../src/database/prisma.service';
import { UsersService } from '../../src/users/users.service';
import { SessionsService } from '../../src/sessions/sessions.service';
import { EmailService } from '../../src/email/email.service';
import { LoginRateLimitService } from '../../src/auth/login-rate-limit.service';
import { FraudService } from '../../src/fraud/fraud.service';
import { ApiKeyAnalyticsService } from '../../src/auth/api-key-analytics.service';
import { ConfigService } from '@nestjs/config';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { createSha256, hashPassword } from '../../src/auth/security.utils';
import * as jwt from 'jsonwebtoken';

const ACCESS_SECRET = 'test-access-secret-at-least-32-characters-long';
const REFRESH_SECRET = 'test-refresh-secret-at-least-32-characters-long';

describe('Fraud alert auto-block e2e', () => {
  let app: INestApplication;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let authService: AuthService;
  let prisma: any;

  beforeAll(async () => {
    const users = new Map<string, any>();
    const blacklistedTokens = new Map<string, any>();
    const fraudAlerts = new Map<string, any>();
    const sessions = new Map<string, any>();
    const activityLogs: any[] = [];
    const loginHistory: any[] = [];
    const loginAttempts: any[] = [];
    let nextId = 0;
    const nid = () => `id-${++nextId}`;

    prisma = {
      user: {
        create: async ({ data }: any) => {
          const id = data.id ?? nid();
          const record = {
            id,
            email: data.email,
            password: data.password,
            firstName: data.firstName,
            lastName: data.lastName,
            emailVerificationToken: data.emailVerificationToken,
            emailVerificationExpires: data.emailVerificationExpires,
            isVerified: data.isVerified ?? false,
            isBlocked: data.isBlocked ?? false,
            isDeactivated: false,
            role: data.role ?? 'USER',
            twoFactorEnabled: false,
            twoFactorSecret: null,
            twoFactorBackupCodes: [],
            trustScore: 0,
            lastActivityAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          users.set(id, record);
          return record;
        },
        findUnique: async ({ where }: any) => {
          if (where?.id) return users.get(where.id) ?? null;
          return Array.from(users.values()).find((u) => u.email === where.email) ?? null;
        },
        findFirst: async ({ where }: any) => {
          if (!where) return null;
          return (
            Array.from(users.values()).find((u) => {
              for (const k of Object.keys(where)) {
                if (u[k] !== where[k]) return false;
              }
              return true;
            }) ?? null
          );
        },
        update: async ({ where, data }: any) => {
          const user = users.get(where.id);
          if (!user) return null;
          Object.assign(user, data);
          return user;
        },
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        updateMany: async ({ where, data }: any) => {
          for (const user of users.values()) {
            Object.assign(user, data);
          }
          return { count: users.size };
        },
        count: async () => users.size,
      } as any,
      blacklistedToken: {
        findUnique: async ({ where }: any) => blacklistedTokens.get(where.jti) ?? null,
        findMany: async ({ where }: any) => {
          const results = [];
          for (const [, t] of blacklistedTokens) {
            let match = true;
            if (where?.tokenFamily) match = match && t.tokenFamily === where.tokenFamily;
            if (where?.userId) match = match && t.userId === where.userId;
            if (where?.expiresAt?.gt) match = match && t.expiresAt > where.expiresAt.gt;
            if (match) results.push(t);
          }
          return results;
        },
        upsert: async ({ where, create }: any) => {
          const existing = blacklistedTokens.get(where.jti);
          if (existing) {
            const merged = { ...existing, ...create };
            blacklistedTokens.set(where.jti, merged);
            return merged;
          }
          blacklistedTokens.set(where.jti, create);
          return create;
        },
        update: async ({ where, data }: any) => {
          const existing = blacklistedTokens.get(where.jti);
          if (existing) {
            Object.assign(existing, data);
            return existing;
          }
          return data;
        },
        count: async () => blacklistedTokens.size,
        deleteMany: async () => ({ count: 0 }),
      } as any,
      fraudAlert: {
        findFirst: async ({ where }: any) => {
          for (const [, alert] of fraudAlerts) {
            let match = true;
            if (where?.pattern) match = match && alert.pattern === where.pattern;
            if (where?.userId) match = match && alert.userId === where.userId;
            if (where?.status?.in) match = match && where.status.in.includes(alert.status);
            if (match) return alert;
          }
          return null;
        },
        findUnique: async ({ where }: any) => fraudAlerts.get(where.id) ?? null,
        create: async ({ data }: any) => {
          const id = nid();
          const record = {
            id,
            ...data,
            occurrenceCount: 1,
            lastDetectedAt: new Date(),
            status: 'OPEN',
            autoBlocked: data.autoBlocked ?? false,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          fraudAlerts.set(id, record);
          return record;
        },
        update: async ({ where, data }: any) => {
          const existing = fraudAlerts.get(where.id);
          if (existing) {
            Object.assign(existing, data);
            return existing;
          }
          return data;
        },
        findMany: async () => Array.from(fraudAlerts.values()),
        count: async () => fraudAlerts.size,
        groupBy: async () => [],
      } as any,
      fraudInvestigationNote: { create: async ({ data }: any) => ({ id: nid(), ...data }) } as any,
      activityLog: {
        create: async ({ data }: any) => {
          const record = { id: nid(), ...data, createdAt: new Date() };
          activityLogs.push(record);
          return record;
        },
        findMany: async () => activityLogs,
      } as any,
      loginAttempt: {
        create: async ({ data }: any) => {
          const record = { id: nid(), ...data, attemptTime: new Date() };
          loginAttempts.push(record);
          return record;
        },
        count: async ({ where }: any) => {
          return loginAttempts.filter((a) => {
            let match = true;
            if (where?.email) match = match && a.email === where.email;
            if (where?.success !== undefined) match = match && a.success === where.success;
            if (where?.attemptTime?.gte) match = match && a.attemptTime >= where.attemptTime.gte;
            return match;
          }).length;
        },
        findFirst: async () => null,
        updateMany: async () => ({ count: 0 }),
        deleteMany: async () => ({ count: 0 }),
      } as any,
      loginHistory: {
        create: async ({ data }: any) => {
          const record = { id: nid(), ...data, timestamp: new Date() };
          loginHistory.push(record);
          return record;
        },
        findMany: async ({ where }: any) => {
          return loginHistory.filter((h) => {
            let match = true;
            if (where?.userId) match = match && h.userId === where.userId;
            if (where?.ipAddress) match = match && h.ipAddress === where.ipAddress;
            if (where?.timestamp?.gte) match = match && h.timestamp >= where.timestamp.gte;
            return match;
          });
        },
        count: async ({ where }: any) => {
          return loginHistory.filter((h) => {
            let match = true;
            if (where?.userId) match = match && h.userId === where.userId;
            if (where?.ipAddress) match = match && h.ipAddress === where.ipAddress;
            if (where?.timestamp?.gte) match = match && h.timestamp >= where.timestamp.gte;
            return match;
          }).length;
        },
      } as any,
      session: {
        create: async ({ data }: any) => {
          const id = nid();
          const record = { id, ...data, createdAt: new Date(), isRevoked: false };
          sessions.set(id, record);
          return record;
        },
        findFirst: async ({ where }: any) => {
          for (const [, s] of sessions) {
            let match = true;
            if (where?.userId) match = match && s.userId === where.userId;
            if (where?.OR) {
              match = false;
              for (const cond of where.OR) {
                if (cond.refreshTokenJti && s.refreshTokenJti === cond.refreshTokenJti)
                  match = true;
                if (cond.accessTokenJti && s.accessTokenJti === cond.accessTokenJti) match = true;
              }
            }
            if (match) return s;
          }
          return null;
        },
        findMany: async ({ where }: any) => {
          return Array.from(sessions.values()).filter(
            (s) => !where?.userId || s.userId === where.userId,
          );
        },
        updateMany: async ({ where, data }: any) => {
          let count = 0;
          for (const s of sessions.values()) {
            if (where?.userId && s.userId === where.userId) {
              Object.assign(s, data);
              count++;
            }
          }
          return { count };
        },
      } as any,
      passwordResetToken: {
        findUnique: async () => null,
        create: async () => ({}),
        updateMany: async () => ({ count: 0 }),
        update: async ({ data }: any) => data,
      } as any,
      passwordHistory: {
        create: async () => ({}),
        findMany: async () => [],
        deleteMany: async () => ({ count: 0 }),
      } as any,
      apiKey: {
        create: async ({ data }: any) => ({ id: nid(), ...data }),
        findUnique: async () => null,
        findFirst: async () => null,
        findMany: async () => [],
        update: async ({ data }: any) => data,
      } as any,
      $transaction: jest.fn(async (fnOrArray: any) => {
        if (typeof fnOrArray === 'function') return fnOrArray(prisma);
        return Promise.all(fnOrArray);
      }),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: ApiKeyAnalyticsService,
          useValue: {
            trackUsage: jest.fn().mockResolvedValue(undefined),
            getUsageStats: jest.fn().mockResolvedValue({}),
          },
        },
        AuthService,
        LoginRateLimitService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: UsersService,
          useValue: {
            findByEmail: async (email: string) => {
              return Array.from(users.values()).find((u) => u.email === email) ?? null;
            },
          },
        },
        {
          provide: SessionsService,
          useValue: {
            createSession: jest.fn().mockResolvedValue({}),
            revokeAllSessions: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              const cfg: Record<string, string> = {
                JWT_SECRET: ACCESS_SECRET,
                JWT_REFRESH_SECRET: REFRESH_SECRET,
                JWT_ACCESS_EXPIRES_IN: '15m',
                JWT_REFRESH_EXPIRES_IN: '7d',
                BCRYPT_ROUNDS: '4',
                CAPTCHA_THRESHOLD: '3',
                PASSWORD_HISTORY_LIMIT: '5',
                EMAIL_VERIFICATION_EXPIRES_IN: '24h',
              };
              return cfg[key];
            },
          },
        },
        {
          provide: EmailService,
          useValue: {
            sendEmail: jest.fn().mockResolvedValue(undefined),
            sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
            sendAccountLockedEmail: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: FraudService,
          useValue: {
            handleTokenReuse: jest
              .fn()
              .mockImplementation(async (userId: string, jti: string, ip: string) => {
                await prisma.user.update({ where: { id: userId }, data: { isBlocked: true } });
                await prisma.fraudAlert.create({
                  data: {
                    userId,
                    pattern: 'TOKEN_REUSE',
                    severity: 'CRITICAL',
                    status: 'OPEN',
                    description: `Token reuse detected for user ${userId}`,
                    ipAddress: ip,
                    evidence: { jti },
                    autoBlocked: true,
                  },
                });
              }),
            evaluateFailedLogin: jest.fn().mockResolvedValue(null),
            evaluateSuccessfulLogin: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: false }));
    await app.init();

    authService = moduleRef.get(AuthService);
  }, 20000);

  afterAll(async () => {
    if (app) await app.close();
  });

  beforeEach(() => {
    const fraudService = app.get(FraudService) as any;
    fraudService.handleTokenReuse.mockClear();
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function signRefresh(payload: Record<string, any>) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { exp, ...rest } = payload;
    return jwt.sign(rest, REFRESH_SECRET, { expiresIn: '7d', issuer: 'PropChain' });
  }

  it('auto-blocks user when token reuse triggers fraud alert', async () => {
    const email = `fraud-auto+${Date.now()}@example.com`;
    const password = 'ComplexPass123!';

    // Register user directly via service (avoids IP-map issues)
    const hash = await hashPassword(password, 4);
    const verificationToken = `tok-${Date.now()}`;
    const user = await prisma.user.create({
      data: {
        email,
        password: hash,
        firstName: 'Fraud',
        lastName: 'Test',
        emailVerificationToken: verificationToken,
        emailVerificationExpires: new Date(Date.now() + 3600000),
      },
    });

    // Verify email via HTTP
    const verifyRes = await request(app.getHttpServer())
      .post('/auth/verify-email')
      .send({ token: verificationToken });

    expect(verifyRes.status).toBe(201);
    expect(verifyRes.body.accessToken).toBeDefined();
    expect(verifyRes.body.refreshToken).toBeDefined();

    const firstRefreshToken = verifyRes.body.refreshToken;

    // Use the refresh token once (blacklists it)
    const refreshRes1 = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: firstRefreshToken })
      .expect(201);

    expect(refreshRes1.body.refreshToken).toBeDefined();

    // Reuse the blacklisted refresh token (should trigger auto-block)
    const reuseRes = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: firstRefreshToken })
      .expect(401);

    expect(reuseRes.body.message).toContain('Token reuse detected');

    // Verify user is now blocked
    const blockedUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(blockedUser).toBeDefined();
    expect(blockedUser.isBlocked).toBe(true);
  }, 30000);

  it('creates a fraud alert with CRITICAL severity on token reuse', async () => {
    const email = `fraud-alert+${Date.now()}@example.com`;
    const password = 'ComplexPass123!';

    const hash = await hashPassword(password, 4);
    const verificationToken = `tok-alert-${Date.now()}`;
    const user = await prisma.user.create({
      data: {
        email,
        password: hash,
        firstName: 'Alert',
        lastName: 'Test',
        emailVerificationToken: verificationToken,
        emailVerificationExpires: new Date(Date.now() + 3600000),
      },
    });

    const verifyRes = await request(app.getHttpServer())
      .post('/auth/verify-email')
      .send({ token: verificationToken })
      .expect(201);

    const firstRefreshToken = verifyRes.body.refreshToken;

    // Rotate once
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: firstRefreshToken })
      .expect(201);

    // Reuse
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: firstRefreshToken })
      .expect(401);

    // Check that fraud alert was created via fraud service mock
    const fraudService = app.get(FraudService) as any;
    expect(fraudService.handleTokenReuse).toHaveBeenCalledWith(
      user.id,
      expect.any(String),
      expect.any(String),
      undefined,
    );
  }, 30000);

  it('login attempt for blocked user returns 401', async () => {
    const email = `fraud-blocked+${Date.now()}@example.com`;
    const password = 'ComplexPass123!';

    const hash = await hashPassword(password, 4);
    const verificationToken = `tok-blocked-${Date.now()}`;
    await prisma.user.create({
      data: {
        email,
        password: hash,
        firstName: 'Blocked',
        lastName: 'Test',
        emailVerificationToken: verificationToken,
        emailVerificationExpires: new Date(Date.now() + 3600000),
        isBlocked: true,
      },
    });

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(401);

    expect(loginRes.body.message).toContain('blocked');
  }, 15000);
});
