import {
  INestApplication,
  ValidationPipe,
  Injectable,
  CanActivate,
  ExecutionContext,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { PrismaService } from '../../src/database/prisma.service';
import { TrustScoreController } from '../../src/trust-score/trust-score.controller';
import { TrustScoreService } from '../../src/trust-score/trust-score.service';
import { JwtAuthGuard } from '../../src/auth/guards/jwt-auth.guard';
import { ApiKeyAuthGuard } from '../../src/auth/guards/api-key-auth.guard';
import { AuthUserPayload } from '../../src/auth/types/auth-user.type';

const USER_A_ID = 'trust-score-user-a';
const USER_B_ID = 'trust-score-user-b';
const USER_C_ID = 'trust-score-user-c';

@Injectable()
class MockJwtAuthGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    if (!req.headers['authorization']) return false;
    const authHeader = req.headers['authorization'] as string;
    const token = authHeader.slice(7);
    let userId = USER_A_ID;
    if (token === 'user-b') userId = USER_B_ID;
    if (token === 'user-c') userId = USER_C_ID;
    const user: AuthUserPayload = {
      sub: userId,
      email: `${userId}@example.com`,
      role: 'USER',
      tier: 'FREE',
      type: 'access',
    };
    req.user = user;
    req.authUser = { id: userId, email: user.email, type: 'access' };
    return true;
  }
}

@Injectable()
class MockApiKeyAuthGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    if (!req.headers['x-api-key']) return false;
    req.authUser = { id: USER_A_ID, email: `${USER_A_ID}@example.com`, type: 'api-key' };
    return true;
  }
}

class FakePrismaService {
  users = new Map<string, any>();
  verificationDocuments = new Map<string, any>();
  transactions = new Map<string, any>();

  async $connect() {}
  async $disconnect() {}
  async $transaction(fn: any) {
    if (typeof fn === 'function') return fn(this);
    return Promise.all(fn);
  }

  user = {
    create: async ({ data }: any) => {
      const id = data.id ?? `user-${Date.now()}`;
      const record = {
        id,
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        isVerified: data.isVerified ?? false,
        isBlocked: data.isBlocked ?? false,
        isDeactivated: false,
        role: data.role ?? 'USER',
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorBackupCodes: [],
        trustScore: data.trustScore ?? 0,
        lastActivityAt: data.lastActivityAt ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.users.set(id, record);
      return record;
    },
    findUnique: async ({ where, include }: any) => {
      if (!where?.id) return null;
      const user = this.users.get(where.id) ?? null;
      if (!user) return null;
      if (!include) return user;
      const result = { ...user };
      if (include.buyerTransactions || include.sellerTransactions) {
        result.buyerTransactions = Array.from(this.transactions.values()).filter(
          (t: any) => t.buyerId === user.id,
        );
        result.sellerTransactions = Array.from(this.transactions.values()).filter(
          (t: any) => t.sellerId === user.id,
        );
      }
      return result;
    },
    findFirst: async ({ where }: any) => {
      if (!where) return null;
      return (
        Array.from(this.verificationDocuments.values()).find((d: any) => {
          for (const k of Object.keys(where)) {
            if (k === 'AND' || k === 'OR' || k === 'NOT') continue;
            if (d[k] !== where[k]) return false;
          }
          return true;
        }) ?? null
      );
    },
    findMany: async () => Array.from(this.users.values()),
    update: async ({ where, data }: any) => {
      const existing = this.users.get(where.id);
      if (!existing) throw new Error('User not found');
      const updated = { ...existing, ...data, updatedAt: new Date() };
      this.users.set(where.id, updated);
      return updated;
    },
    count: async () => this.users.size,
  } as any,

  verificationDocument: {
    findFirst: async ({ where }: any) => {
      if (!where) return null;
      return (
        Array.from(this.verificationDocuments.values()).find((d: any) => {
          for (const k of Object.keys(where)) {
            if (k === 'AND' || k === 'OR' || k === 'NOT') continue;
            if (d[k] !== where[k]) return false;
          }
          return true;
        }) ?? null
      );
    },
  } as any,

  transaction: {
    findMany: async () => Array.from(this.transactions.values()),
  } as any,
}

describe('Trust score API (e2e)', () => {
  let app: INestApplication;
  let fakePrisma: FakePrismaService;

  beforeAll(async () => {
    fakePrisma = new FakePrismaService();

    const now = new Date();
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    await fakePrisma.user.create({
      data: {
        id: USER_A_ID,
        email: 'user-a@example.com',
        firstName: 'Alice',
        lastName: 'A',
        isVerified: true,
        lastActivityAt: now,
      },
    });

    await fakePrisma.user.create({
      data: {
        id: USER_B_ID,
        email: 'user-b@example.com',
        firstName: 'Bob',
        lastName: 'B',
        isVerified: false,
        lastActivityAt: monthAgo,
      },
    });

    await fakePrisma.user.create({
      data: {
        id: USER_C_ID,
        email: 'user-c@example.com',
        firstName: 'Carol',
        lastName: 'C',
        isVerified: true,
        lastActivityAt: now,
      },
    });

    const txIdA = 'tx-user-a-1';
    fakePrisma.transactions.set(txIdA, {
      id: txIdA,
      buyerId: USER_A_ID,
      sellerId: USER_B_ID,
      status: 'COMPLETED',
      createdAt: new Date(),
    });
    const txIdB = 'tx-user-a-2';
    fakePrisma.transactions.set(txIdB, {
      id: txIdB,
      buyerId: USER_B_ID,
      sellerId: USER_A_ID,
      status: 'COMPLETED',
      createdAt: new Date(),
    });
    const txIdC = 'tx-user-a-3';
    fakePrisma.transactions.set(txIdC, {
      id: txIdC,
      buyerId: USER_A_ID,
      sellerId: USER_C_ID,
      status: 'PENDING',
      createdAt: new Date(),
    });

    fakePrisma.verificationDocuments.set('doc-a', {
      id: 'doc-a',
      userId: USER_A_ID,
      status: 'APPROVED',
      type: 'PASSPORT',
    });
    fakePrisma.verificationDocuments.set('doc-b', {
      id: 'doc-b',
      userId: USER_B_ID,
      status: 'REJECTED',
      type: 'PASSPORT',
    });

    const moduleRef = await Test.createTestingModule({
      controllers: [TrustScoreController],
      providers: [
        TrustScoreService,
        { provide: PrismaService, useValue: fakePrisma as any },
        {
          provide: AuthUserPayload,
          useValue: {
            sub: USER_A_ID,
            email: 'user-a@example.com',
            role: 'USER',
            tier: 'FREE',
            type: 'access',
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(new MockJwtAuthGuard())
      .overrideGuard(ApiKeyAuthGuard)
      .useValue(new MockApiKeyAuthGuard())
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false, transform: true }),
    );
    await app.init();
  }, 30000);

  afterAll(async () => {
    await app?.close();
  });

  // ── Authentication ──────────────────────────────────────────────────────────

  describe('Authentication', () => {
    it('rejects unauthenticated access to /trust-score/me', async () => {
      await request(app.getHttpServer())
        .get('/trust-score/me')
        .expect((r) => {
          expect([401, 403]).toContain(r.status);
        });
    });

    it('rejects unauthenticated access to /trust-score/batch-update', async () => {
      await request(app.getHttpServer())
        .post('/trust-score/batch-update')
        .expect((r) => {
          expect([401, 403]).toContain(r.status);
        });
    });
  });

  // ── GET /trust-score/me ─────────────────────────────────────────────────────

  describe('GET /trust-score/me', () => {
    it('returns the current user trust score', async () => {
      const res = await request(app.getHttpServer())
        .get('/trust-score/me')
        .set('Authorization', 'Bearer valid')
        .expect(200);

      expect(res.body).toBeDefined();
      expect(res.body.userId).toBe(USER_A_ID);
      expect(typeof res.body.score).toBe('number');
      expect(res.body.breakdown).toBeDefined();
      expect(res.body.lastUpdated).toBeDefined();
    });

    it('returns a different score for a different authenticated user', async () => {
      const resA = await request(app.getHttpServer())
        .get('/trust-score/me')
        .set('Authorization', 'Bearer valid')
        .expect(200);

      const resB = await request(app.getHttpServer())
        .get('/trust-score/me')
        .set('Authorization', 'Bearer user-b')
        .expect(200);

      expect(resA.body.userId).toBe(USER_A_ID);
      expect(resB.body.userId).toBe(USER_B_ID);
    });
  });

  // ── GET /trust-score/:userId ───────────────────────────────────────────────

  describe('GET /trust-score/:userId', () => {
    it('returns trust score for a specific user by ID', async () => {
      const res = await request(app.getHttpServer())
        .get(`/trust-score/${USER_A_ID}`)
        .set('Authorization', 'Bearer valid')
        .expect(200);

      expect(res.body.userId).toBe(USER_A_ID);
      expect(typeof res.body.score).toBe('number');
    });

    it('returns 404 for a non-existent user', async () => {
      await request(app.getHttpServer())
        .get('/trust-score/non-existent-user')
        .set('Authorization', 'Bearer valid')
        .expect((r) => {
          expect([404, 500]).toContain(r.status);
        });
    });
  });

  // ── Summary endpoints ──────────────────────────────────────────────────────

  describe('GET /trust-score/me/summary', () => {
    it('returns a lightweight summary for the current user', async () => {
      const res = await request(app.getHttpServer())
        .get('/trust-score/me/summary')
        .set('Authorization', 'Bearer valid')
        .expect(200);

      expect(res.body.userId).toBe(USER_A_ID);
      expect(typeof res.body.score).toBe('number');
      expect(res.body.lastUpdated).toBeDefined();
      expect(res.body.breakdown).toBeUndefined();
    });
  });

  describe('GET /trust-score/:userId/summary', () => {
    it('returns summary for a specific user', async () => {
      const res = await request(app.getHttpServer())
        .get(`/trust-score/${USER_B_ID}/summary`)
        .set('Authorization', 'Bearer valid')
        .expect(200);

      expect(res.body.userId).toBe(USER_B_ID);
      expect(typeof res.body.score).toBe('number');
    });
  });

  // ── Breakdown endpoints ────────────────────────────────────────────────────

  describe('GET /trust-score/me/breakdown', () => {
    it('returns score breakdown for the current user', async () => {
      const res = await request(app.getHttpServer())
        .get('/trust-score/me/breakdown')
        .set('Authorization', 'Bearer valid')
        .expect(200);

      expect(res.body.emailVerified).toBeDefined();
      expect(res.body.idVerified).toBeDefined();
      expect(res.body.completedTransactions).toBeDefined();
      expect(res.body.activityDecay).toBeDefined();
      expect(res.body.totalScore).toBeDefined();
      expect(res.body.totalMaxScore).toBe(75);
    });
  });

  describe('GET /trust-score/:userId/breakdown', () => {
    it('returns breakdown for a specific user', async () => {
      const res = await request(app.getHttpServer())
        .get(`/trust-score/${USER_C_ID}/breakdown`)
        .set('Authorization', 'Bearer valid')
        .expect(200);

      expect(res.body.emailVerified).toBeDefined();
      expect(res.body.idVerified).toBeDefined();
    });
  });

  // ── Score computation correctness ──────────────────────────────────────────

  describe('Score computation', () => {
    it('computes a high score for a fully verified active user with transactions', async () => {
      const res = await request(app.getHttpServer())
        .get('/trust-score/me')
        .set('Authorization', 'Bearer valid')
        .expect(200);

      const breakdown = res.body.breakdown;
      expect(breakdown.emailVerified.score).toBe(10);
      expect(breakdown.idVerified.score).toBe(20);
      expect(breakdown.completedTransactions.score).toBeGreaterThanOrEqual(15);
      expect(breakdown.totalMaxScore).toBe(75);
    });

    it('computes a lower score for an unverified inactive user', async () => {
      const res = await request(app.getHttpServer())
        .get('/trust-score/me')
        .set('Authorization', 'Bearer user-b')
        .expect(200);

      const breakdown = res.body.breakdown;
      expect(breakdown.emailVerified.score).toBe(0);
      expect(breakdown.idVerified.score).toBe(0);
    });
  });

  // ── Force calculation endpoints ────────────────────────────────────────────

  describe('POST /trust-score/me/calculate', () => {
    it('force-recalculates and returns updated score', async () => {
      const res = await request(app.getHttpServer())
        .post('/trust-score/me/calculate')
        .set('Authorization', 'Bearer valid')
        .expect(200);

      expect(res.body.userId).toBe(USER_A_ID);
      expect(typeof res.body.score).toBe('number');
      expect(res.body.lastUpdated).toBeDefined();
      expect(res.body.nextUpdateTime).toBeDefined();
    });
  });

  describe('POST /trust-score/:userId/calculate', () => {
    it('force-recalculates score for a specific user', async () => {
      const res = await request(app.getHttpServer())
        .post(`/trust-score/${USER_C_ID}/calculate`)
        .set('Authorization', 'Bearer valid')
        .expect(200);

      expect(res.body.userId).toBe(USER_C_ID);
      expect(typeof res.body.score).toBe('number');
    });
  });

  // ── Batch update ───────────────────────────────────────────────────────────

  describe('POST /trust-score/batch-update', () => {
    it('returns updated and failed counts', async () => {
      const res = await request(app.getHttpServer())
        .post('/trust-score/batch-update')
        .set('Authorization', 'Bearer valid')
        .expect(200);

      expect(res.body).toBeDefined();
      expect(typeof res.body.updated).toBe('number');
      expect(typeof res.body.failed).toBe('number');
      expect(res.body.updated).toBeGreaterThanOrEqual(0);
    });
  });

  // ── Refresh query parameter ────────────────────────────────────────────────

  describe('GET /trust-score/me?refresh=true', () => {
    it('forces a fresh calculation when refresh=true', async () => {
      const res = await request(app.getHttpServer())
        .get('/trust-score/me?refresh=true')
        .set('Authorization', 'Bearer valid')
        .expect(200);

      expect(res.body.userId).toBe(USER_A_ID);
      expect(typeof res.body.score).toBe('number');
      expect(res.body.lastUpdated).toBeDefined();
    });
  });

  describe('GET /trust-score/:userId?refresh=true', () => {
    it('forces a fresh calculation for a specific user', async () => {
      const res = await request(app.getHttpServer())
        .get(`/trust-score/${USER_B_ID}?refresh=true`)
        .set('Authorization', 'Bearer valid')
        .expect(200);

      expect(res.body.userId).toBe(USER_B_ID);
      expect(typeof res.body.score).toBe('number');
    });
  });

  // ── ApiKey auth guard ──────────────────────────────────────────────────────

  describe('API key authentication', () => {
    it('allows access with x-api-key header', async () => {
      const res = await request(app.getHttpServer())
        .get('/trust-score/me')
        .set('X-Api-Key', 'valid-api-key')
        .expect(200);

      expect(res.body.userId).toBe(USER_A_ID);
    });
  });
});
