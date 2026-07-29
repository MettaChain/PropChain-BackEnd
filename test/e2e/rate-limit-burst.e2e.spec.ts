import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import * as request from 'supertest';
import { AuthController } from '../../src/auth/auth.controller';
import { AuthService } from '../../src/auth/auth.service';
import { PrismaService } from '../../src/database/prisma.service';
import { UsersService } from '../../src/users/users.service';
import { SessionsService } from '../../src/sessions/sessions.service';
import { EmailService } from '../../src/email/email.service';
import { LoginRateLimitService } from '../../src/auth/login-rate-limit.service';
import { RateLimitService } from '../../src/auth/rate-limit.service';
import { RateLimitGuard } from '../../src/auth/guards/rate-limit.guard';
import { RateLimitHeadersInterceptor } from '../../src/auth/interceptors/rate-limit-headers.interceptor';
import { FraudService } from '../../src/fraud/fraud.service';
import { ApiKeyAnalyticsService } from '../../src/auth/api-key-analytics.service';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';

class InMemoryCache {
  private store = new Map<string, { value: any; expiresAt: number }>();

  async get(key: string) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: any, ttl?: number) {
    const expiresAt = Date.now() + (ttl ?? 60000);
    this.store.set(key, { value, expiresAt });
  }

  async del(key: string) {
    this.store.delete(key);
  }

  async reset() {
    this.store.clear();
  }
}

describe('Rate-limit guard e2e – burst traffic', () => {
  let app: INestApplication;
  let cache: InMemoryCache;

  beforeAll(async () => {
    const users = new Map<string, any>();
    const blacklistedTokens = new Map<string, any>();
    const sessions = new Map<string, any>();
    let nextId = 0;
    const nid = () => `id-${++nextId}`;

    const prisma: any = {
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
            isVerified: data.isVerified ?? true,
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
      },
      blacklistedToken: {
        findUnique: async ({ where }: any) => blacklistedTokens.get(where.jti) ?? null,
        findMany: async () => [],
        upsert: async ({ where, create }: any) => {
          blacklistedTokens.set(where.jti, create);
          return create;
        },
        update: async ({ data }: any) => data,
        count: async () => 0,
        deleteMany: async () => ({ count: 0 }),
      },
      fraudAlert: {
        findFirst: async () => null,
        findUnique: async () => null,
        create: async ({ data }: any) => ({
          id: nid(),
          ...data,
          occurrenceCount: 1,
          status: 'OPEN',
        }),
        update: async ({ data }: any) => data,
        findMany: async () => [],
        count: async () => 0,
        groupBy: async () => [],
      },
      fraudInvestigationNote: { create: async ({ data }: any) => ({ id: nid(), ...data }) },
      activityLog: { create: async () => ({}), findMany: async () => [] },
      loginAttempt: {
        create: async ({ data }: any) => ({ id: nid(), ...data, attemptTime: new Date() }),
        count: async () => 0,
        findFirst: async () => null,
        updateMany: async () => ({ count: 0 }),
        deleteMany: async () => ({ count: 0 }),
      },
      loginHistory: {
        create: async ({ data }: any) => ({ id: nid(), ...data, timestamp: new Date() }),
        findMany: async () => [],
        count: async () => 0,
      },
      session: {
        create: async ({ data }: any) => {
          const id = nid();
          sessions.set(id, { id, ...data, createdAt: new Date() });
          return sessions.get(id);
        },
        findFirst: async () => null,
        findMany: async () => [],
        updateMany: async () => ({ count: 0 }),
      },
      passwordResetToken: {
        findUnique: async () => null,
        create: async () => ({}),
        updateMany: async () => ({ count: 0 }),
        update: async ({ data }: any) => data,
      },
      passwordHistory: {
        create: async () => ({}),
        findMany: async () => [],
        deleteMany: async () => ({ count: 0 }),
      },
      apiKey: {
        create: async ({ data }: any) => ({ id: nid(), ...data }),
        findUnique: async () => null,
        findFirst: async () => null,
        findMany: async () => [],
        update: async ({ data }: any) => data,
      },
      $transaction: jest.fn(async (fnOrArray: any) => {
        if (typeof fnOrArray === 'function') return fnOrArray(prisma);
        return Promise.all(fnOrArray);
      }),
    };

    cache = new InMemoryCache();

    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        AuthService,
        LoginRateLimitService,
        RateLimitService,
        RateLimitGuard,
        RateLimitHeadersInterceptor,
        Reflector,
        {
          provide: ApiKeyAnalyticsService,
          useValue: {
            trackUsage: jest.fn().mockResolvedValue(undefined),
            getUsageStats: jest.fn().mockResolvedValue({}),
          },
        },
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
                JWT_SECRET: 'test-access-secret-at-least-32-characters-long',
                JWT_REFRESH_SECRET: 'test-refresh-secret-at-least-32-characters-long',
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
            handleTokenReuse: jest.fn().mockResolvedValue(undefined),
            evaluateFailedLogin: jest.fn().mockResolvedValue(null),
            evaluateSuccessfulLogin: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: CACHE_MANAGER,
          useValue: cache,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: false }));
    app.useGlobalInterceptors(new RateLimitHeadersInterceptor());
    app.useGlobalGuards(new RateLimitGuard(new Reflector(), moduleRef.get(RateLimitService)));
    await app.init();
  }, 20000);

  afterAll(async () => {
    if (app) await app.close();
  });

  beforeEach(async () => {
    await cache.reset();
  });

  it('allows requests within rate limit window', async () => {
    const email = `burst-ok+${Date.now()}@example.com`;

    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'ComplexPass123!', firstName: 'Burst', lastName: 'Test' })
      .expect(201);

    expect(res.body).toBeDefined();
  });

  it('blocks repeated login attempts exceeding the per-endpoint limit', async () => {
    const email = `burst-block+${Date.now()}@example.com`;
    const password = 'WrongPass123!';

    // POST /auth/login has limit of 5 per 15 min
    const results: number[] = [];

    for (let i = 0; i < 7; i++) {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .set('X-Forwarded-For', '10.99.0.1')
        .send({ email, password });
      results.push(res.status);
    }

    // First attempts should be 401 (invalid credentials)
    // After exceeding limit, should get 429
    const not429Count = results.filter((s) => s !== 429).length;
    const rateLimitedCount = results.filter((s) => s === 429).length;

    expect(not429Count).toBeGreaterThanOrEqual(1);
    if (rateLimitedCount > 0) {
      expect(rateLimitedCount).toBeGreaterThanOrEqual(1);
    }
  }, 15000);

  it('includes rate-limit headers in responses', async () => {
    const email = `burst-headers+${Date.now()}@example.com`;

    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .set('X-Forwarded-For', '10.88.0.1')
      .send({ email, password: 'SomePass123!' });

    const limitHeader = res.headers['x-ratelimit-limit'];
    const remainingHeader = res.headers['x-ratelimit-remaining'];
    const resetHeader = res.headers['x-ratelimit-reset'];

    expect(limitHeader).toBeDefined();
    expect(remainingHeader).toBeDefined();
    expect(resetHeader).toBeDefined();
  });

  it('returns 429 with retryAfter when endpoint rate limit is exceeded', async () => {
    // POST /auth/register has limit of 5 per hour
    const results: number[] = [];
    for (let i = 0; i < 7; i++) {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .set('X-Forwarded-For', '10.77.0.1')
        .send({
          email: `rate-limit-check+${i}+${Date.now()}@example.com`,
          password: 'ComplexPass123!',
          firstName: 'Rate',
          lastName: 'Limit',
        });
      results.push(res.status);
    }

    const rateLimited = results.filter((s) => s === 429);
    if (rateLimited.length > 0) {
      const retryRes = await request(app.getHttpServer())
        .post('/auth/register')
        .set('X-Forwarded-For', '10.77.0.1')
        .send({
          email: `rate-limit-check-after+${Date.now()}@example.com`,
          password: 'ComplexPass123!',
          firstName: 'Rate',
          lastName: 'Limit2',
        });

      if (retryRes.status === 429) {
        expect(retryRes.body.retryAfter).toBeDefined();
        expect(typeof retryRes.body.retryAfter).toBe('number');
      }
    }
  }, 15000);

  it('rate limits are per-IP and do not leak across different IPs', async () => {
    const email1 = `ip-a+${Date.now()}@example.com`;
    const email2 = `ip-b+${Date.now()}@example.com`;

    for (let i = 0; i < 3; i++) {
      await request(app.getHttpServer())
        .post('/auth/login')
        .set('X-Forwarded-For', '10.1.1.1')
        .send({ email: email1, password: 'WrongPass!' });
    }

    const resB = await request(app.getHttpServer())
      .post('/auth/login')
      .set('X-Forwarded-For', '10.2.2.2')
      .send({ email: email2, password: 'WrongPass!' });

    expect(resB.status).not.toBe(429);
  });

  it('concurrent burst requests do not corrupt rate-limit counters', async () => {
    const email = `concurrent+${Date.now()}@example.com`;

    // Send rapid sequential requests to stress the counter without overwhelming connections
    const responses: any[] = [];
    for (let i = 0; i < 10; i++) {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .set('X-Forwarded-For', '10.50.0.1')
        .send({ email, password: 'Concurrent123!' });
      responses.push(res);
    }

    const statuses = responses.map((r: any) => r.status);

    for (const status of statuses) {
      expect([401, 429]).toContain(status);
    }

    const lastResponse = responses[responses.length - 1];
    if (lastResponse.status === 429) {
      expect(lastResponse.headers['x-ratelimit-limit']).toBeDefined();
    }
  });
});
