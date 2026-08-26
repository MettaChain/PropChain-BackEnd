/**
 * E2E test: Trust-score API – score computation, summaries, breakdowns, forced recalc.
 *
 * Issue #1070 – Add e2e coverage for the trust-score API.
 *
 * Covers:
 *   - GET /trust-score/me – current user's full trust score
 *   - GET /trust-score/me/summary – lightweight summary
 *   - GET /trust-score/me/breakdown – detailed factor breakdown
 *   - POST /trust-score/me/calculate – force recalculation
 *   - GET /trust-score/:userId – another user's trust score
 *   - GET /trust-score/:userId/summary – another user's summary
 *   - GET /trust-score/:userId/breakdown – another user's breakdown
 *   - POST /trust-score/:userId/calculate – force recalculation for another user
 *   - POST /trust-score/batch-update – recalculate all users
 *   - Score computation correctness across user profiles
 *   - Activity decay for long-inactive users
 */

import { INestApplication, ValidationPipe, Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { PrismaService } from '../../src/database/prisma.service';
import { TrustScoreController } from '../../src/trust-score/trust-score.controller';
import { TrustScoreService } from '../../src/trust-score/trust-score.service';
import { JwtAuthGuard } from '../../src/auth/guards/jwt-auth.guard';
import { ApiKeyAuthGuard } from '../../src/auth/guards/api-key-auth.guard';
import { AuthUserPayload } from '../../src/auth/types/auth-user.type';

// ── User IDs ─────────────────────────────────────────────────────────────────

const USER_A_ID = 'trust-score-user-a'; // verified, 2 completed txns, id-verified
const USER_B_ID = 'trust-score-user-b'; // unverified, no txns, inactive 3 months
const USER_C_ID = 'trust-score-user-c'; // verified, 3 completed txns, id-verified

// ── Role-aware mock guards ───────────────────────────────────────────────────

@Injectable()
class MockJwtAuthGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const authHeader = req.headers['authorization'] as string | undefined;
    if (!authHeader?.startsWith('Bearer ')) return false;
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
    req.authUser = { id: userId, email: user.email, type: 'access' } as any;
    return true;
  }
}

@Injectable()
class MockApiKeyAuthGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const apiKey = req.headers['x-api-key'];
    const authHeader = req.headers['authorization'] as string | undefined;
    // Accept if x-api-key header is present, or if Bearer token was already validated by JwtAuthGuard
    if (apiKey) {
      req.authUser = { id: USER_A_ID, email: `${USER_A_ID}@example.com`, type: 'api-key' } as any;
      return true;
    }
    // If JWT guard already set authUser, pass through
    if (req.authUser) return true;
    return false;
  }
}

// ── Fake Prisma ──────────────────────────────────────────────────────────────

class FakePrismaService {
  users = new Map<string, any>();
  verificationDocs = new Map<string, any>();
  transactions = new Map<string, any>();

  async $connect() {}
  async $disconnect() {}

  user = {
    create: async ({ data }: any) => {
      const id = data.id ?? `user-${Date.now()}`;
      const record = {
        id,
        email: data.email,
        firstName: data.firstName ?? null,
        lastName: data.lastName ?? null,
        isVerified: data.isVerified ?? false,
        isBlocked: data.isBlocked ?? false,
        isDeactivated: false,
        role: data.role ?? 'USER',
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorBackupCodes: [],
        trustScore: data.trustScore ?? 0,
        lastTrustScoreUpdate: data.lastTrustScoreUpdate ?? null,
        lastActivityAt: data.lastActivityAt ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
        password: 'hashed',
        phone: null,
        avatar: null,
        pendingEmail: null,
        emailVerificationToken: null,
        emailVerificationExpires: null,
        preferredChannel: null,
        languagePreference: null,
        timezone: null,
        contactHours: null,
        referralCode: null,
        referredById: null,
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
          (t: any) => t.buyerId === user.id && t.status === 'COMPLETED',
        );
        result.sellerTransactions = Array.from(this.transactions.values()).filter(
          (t: any) => t.sellerId === user.id && t.status === 'COMPLETED',
        );
      }
      return result;
    },
    findMany: async () => Array.from(this.users.values()),
    update: async ({ where, data }: any) => {
      const existing = this.users.get(where.id);
      if (!existing) return null;
      Object.assign(existing, data);
      return existing;
    },
    count: async () => this.users.size,
  } as any;

  verificationDocument = {
    findFirst: async ({ where }: any) => {
      for (const [, doc] of this.verificationDocs) {
        let match = true;
        if (where?.userId) match = match && doc.userId === where.userId;
        if (where?.status) match = match && doc.status === where.status;
        if (match) return doc;
      }
      return null;
    },
  } as any;

  activityLog = {
    create: async () => ({ id: 'log-' + Date.now() }),
  } as any;
}

// ── Test suite ───────────────────────────────────────────────────────────────

describe('Trust-score API (e2e)', () => {
  let app: INestApplication;
  let fakePrisma: FakePrismaService;

  beforeAll(async () => {
    fakePrisma = new FakePrismaService();

    const now = new Date();
    const threeMonthsAgo = new Date(Date.now() - 90 * 86400000);

    // User A: email-verified, 2 completed txns, id-verified, recently active
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

    // User B: unverified, no txns, 3 months inactive → score should be 0
    await fakePrisma.user.create({
      data: {
        id: USER_B_ID,
        email: 'user-b@example.com',
        firstName: 'Bob',
        lastName: 'B',
        isVerified: false,
        lastActivityAt: threeMonthsAgo,
      },
    });

    // User C: email-verified, 3 completed txns (2 buyer + 1 seller), id-verified
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

    // User A: 2 completed transactions (1 as buyer, 1 as seller)
    fakePrisma.transactions.set('tx-a-1', {
      id: 'tx-a-1',
      buyerId: USER_A_ID,
      sellerId: USER_B_ID,
      status: 'COMPLETED',
    });
    fakePrisma.transactions.set('tx-a-2', {
      id: 'tx-a-2',
      buyerId: USER_B_ID,
      sellerId: USER_A_ID,
      status: 'COMPLETED',
    });

    // User C: 3 completed transactions (2 as buyer, 1 as seller)
    // Use a dummy user ID for the counterparty to avoid cross-contamination
    const DUMMY_ID = 'trust-score-dummy';
    fakePrisma.transactions.set('tx-c-1', {
      id: 'tx-c-1',
      buyerId: USER_C_ID,
      sellerId: DUMMY_ID,
      status: 'COMPLETED',
    });
    fakePrisma.transactions.set('tx-c-2', {
      id: 'tx-c-2',
      buyerId: USER_C_ID,
      sellerId: DUMMY_ID,
      status: 'COMPLETED',
    });
    fakePrisma.transactions.set('tx-c-3', {
      id: 'tx-c-3',
      buyerId: DUMMY_ID,
      sellerId: USER_C_ID,
      status: 'COMPLETED',
    });

    // Verification documents
    fakePrisma.verificationDocs.set('vd-a', {
      id: 'vd-a',
      userId: USER_A_ID,
      status: 'APPROVED',
    });
    fakePrisma.verificationDocs.set('vd-c', {
      id: 'vd-c',
      userId: USER_C_ID,
      status: 'APPROVED',
    });

    const moduleRef = await Test.createTestingModule({
      controllers: [TrustScoreController],
      providers: [
        TrustScoreService,
        { provide: PrismaService, useValue: fakePrisma as any },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(new MockJwtAuthGuard())
      .overrideGuard(ApiKeyAuthGuard)
      .useValue(new MockApiKeyAuthGuard())
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false, transform: true }));
    await app.init();
  }, 30000);

  afterAll(async () => {
    await app?.close();
  });

  // ── Authentication ────────────────────────────────────────────────────────

  describe('Authentication', () => {
    it('rejects unauthenticated access to GET /trust-score/me', async () => {
      await request(app.getHttpServer())
        .get('/trust-score/me')
        .expect((r: any) => {
          expect([401, 403]).toContain(r.status);
        });
    });

    it('rejects unauthenticated access to POST /trust-score/batch-update', async () => {
      await request(app.getHttpServer())
        .post('/trust-score/batch-update')
        .expect((r: any) => {
          expect([401, 403]).toContain(r.status);
        });
    });

    it('rejects unauthenticated access to GET /trust-score/:userId', async () => {
      await request(app.getHttpServer())
        .get(`/trust-score/${USER_A_ID}`)
        .expect((r: any) => {
          expect([401, 403]).toContain(r.status);
        });
    });
  });

  // ── GET /trust-score/me ──────────────────────────────────────────────────

  describe('GET /trust-score/me', () => {
    it('returns the authenticated user trust score with full structure', async () => {
      const res = await request(app.getHttpServer())
        .get('/trust-score/me')
        .set('Authorization', 'Bearer user-a')
        .expect(200);

      expect(res.body.userId).toBe(USER_A_ID);
      expect(typeof res.body.score).toBe('number');
      expect(res.body.breakdown).toBeDefined();
      expect(res.body.breakdown.emailVerified).toBeDefined();
      expect(res.body.breakdown.idVerified).toBeDefined();
      expect(res.body.breakdown.completedTransactions).toBeDefined();
      expect(res.body.breakdown.activityDecay).toBeDefined();
      expect(res.body.breakdown.totalMaxScore).toBe(75);
      expect(res.body.lastUpdated).toBeDefined();
      expect(res.body.nextUpdateTime).toBeDefined();
    });

    it('returns a different score for a different authenticated user', async () => {
      const resA = await request(app.getHttpServer())
        .get('/trust-score/me')
        .set('Authorization', 'Bearer user-a')
        .expect(200);

      const resB = await request(app.getHttpServer())
        .get('/trust-score/me')
        .set('Authorization', 'Bearer user-b')
        .expect(200);

      expect(resA.body.userId).toBe(USER_A_ID);
      expect(resB.body.userId).toBe(USER_B_ID);
      // User A should have a higher score than user B
      expect(resA.body.score).toBeGreaterThan(resB.body.score);
    });
  });

  // ── GET /trust-score/:userId ────────────────────────────────────────────

  describe('GET /trust-score/:userId', () => {
    it('returns trust score for a specific user by ID', async () => {
      const res = await request(app.getHttpServer())
        .get(`/trust-score/${USER_A_ID}`)
        .set('Authorization', 'Bearer user-a')
        .expect(200);

      expect(res.body.userId).toBe(USER_A_ID);
      expect(typeof res.body.score).toBe('number');
      expect(res.body.breakdown).toBeDefined();
    });

    it('returns error for a non-existent user', async () => {
      await request(app.getHttpServer())
        .get('/trust-score/non-existent-user')
        .set('Authorization', 'Bearer user-a')
        .expect(500);
    });
  });

  // ── Summary endpoints ────────────────────────────────────────────────────

  describe('GET /trust-score/me/summary', () => {
    it('returns a lightweight summary without breakdown', async () => {
      const res = await request(app.getHttpServer())
        .get('/trust-score/me/summary')
        .set('Authorization', 'Bearer user-a')
        .expect(200);

      expect(res.body.userId).toBe(USER_A_ID);
      expect(typeof res.body.score).toBe('number');
      expect(res.body.lastUpdated).toBeDefined();
      expect(res.body.nextUpdateTime).toBeDefined();
      expect(res.body.breakdown).toBeUndefined();
    });
  });

  describe('GET /trust-score/:userId/summary', () => {
    it('returns summary for another user', async () => {
      const res = await request(app.getHttpServer())
        .get(`/trust-score/${USER_B_ID}/summary`)
        .set('Authorization', 'Bearer user-a')
        .expect(200);

      expect(res.body.userId).toBe(USER_B_ID);
      expect(typeof res.body.score).toBe('number');
      expect(res.body.breakdown).toBeUndefined();
    });
  });

  // ── Breakdown endpoints ──────────────────────────────────────────────────

  describe('GET /trust-score/me/breakdown', () => {
    it('returns full breakdown structure with all factors', async () => {
      const res = await request(app.getHttpServer())
        .get('/trust-score/me/breakdown')
        .set('Authorization', 'Bearer user-a')
        .expect(200);

      expect(res.body.totalScore).toBeDefined();
      expect(res.body.totalMaxScore).toBe(75);
      expect(res.body.emailVerified).toBeDefined();
      expect(res.body.emailVerified.maxScore).toBe(10);
      expect(res.body.idVerified).toBeDefined();
      expect(res.body.idVerified.maxScore).toBe(20);
      expect(res.body.completedTransactions).toBeDefined();
      expect(res.body.completedTransactions.maxScore).toBe(45);
      expect(res.body.activityDecay).toBeDefined();
    });
  });

  describe('GET /trust-score/:userId/breakdown', () => {
    it('returns breakdown for a specific user', async () => {
      const res = await request(app.getHttpServer())
        .get(`/trust-score/${USER_C_ID}/breakdown`)
        .set('Authorization', 'Bearer user-a')
        .expect(200);

      expect(res.body.emailVerified).toBeDefined();
      expect(res.body.idVerified).toBeDefined();
      expect(res.body.completedTransactions).toBeDefined();
    });
  });

  // ── Score computation correctness ────────────────────────────────────────

  describe('Score computation', () => {
    it('User A: email-verified + id-verified + 2 txns → score reflects all factors', async () => {
      const res = await request(app.getHttpServer())
        .get(`/trust-score/${USER_A_ID}`)
        .set('Authorization', 'Bearer user-a')
        .expect(200);

      const bd = res.body.breakdown;
      // Email verified = 10 pts
      expect(bd.emailVerified.score).toBe(10);
      expect(bd.emailVerified.maxScore).toBe(10);
      // ID verified = 20 pts
      expect(bd.idVerified.score).toBe(20);
      expect(bd.idVerified.maxScore).toBe(20);
      // 2 completed txns = 2 × 15 = 30 pts
      expect(bd.completedTransactions.score).toBe(30);
      expect(bd.completedTransactions.maxScore).toBe(45);
      // Recently active → no decay (penalty = 0, final = base = 60)
      expect(bd.totalScore).toBe(60);
      expect(bd.totalMaxScore).toBe(75);
    });

    it('User B: unverified + no id-verified → lower score than verified users', async () => {
      const resA = await request(app.getHttpServer())
        .get(`/trust-score/${USER_A_ID}`)
        .set('Authorization', 'Bearer user-a')
        .expect(200);

      const resB = await request(app.getHttpServer())
        .get(`/trust-score/${USER_B_ID}`)
        .set('Authorization', 'Bearer user-b')
        .expect(200);

      // User B is unverified and has no ID verification → lower base score
      expect(resB.body.breakdown.emailVerified.score).toBe(0);
      expect(resB.body.breakdown.idVerified.score).toBe(0);
      // Overall score should be lower than the fully verified User A
      expect(resB.body.score).toBeLessThan(resA.body.score);
    });

    it('User C: email-verified + id-verified + 3 txns → max score 75', async () => {
      const res = await request(app.getHttpServer())
        .get(`/trust-score/${USER_C_ID}`)
        .set('Authorization', 'Bearer user-a')
        .expect(200);

      const bd = res.body.breakdown;
      expect(bd.emailVerified.score).toBe(10);
      expect(bd.idVerified.score).toBe(20);
      // 3 completed txns → capped at 3 × 15 = 45
      expect(bd.completedTransactions.score).toBe(45);
      expect(bd.totalScore).toBe(75);
    });
  });

  // ── Force calculation endpoints ──────────────────────────────────────────

  describe('POST /trust-score/me/calculate', () => {
    it('force-recalculates and returns updated score', async () => {
      const res = await request(app.getHttpServer())
        .post('/trust-score/me/calculate')
        .set('Authorization', 'Bearer user-a')
        .expect(200);

      expect(res.body.userId).toBe(USER_A_ID);
      expect(typeof res.body.score).toBe('number');
      expect(res.body.breakdown).toBeDefined();
      expect(res.body.lastUpdated).toBeDefined();
      expect(res.body.nextUpdateTime).toBeDefined();
    });
  });

  describe('POST /trust-score/:userId/calculate', () => {
    it('force-recalculates score for a specific user', async () => {
      const res = await request(app.getHttpServer())
        .post(`/trust-score/${USER_C_ID}/calculate`)
        .set('Authorization', 'Bearer user-a')
        .expect(200);

      expect(res.body.userId).toBe(USER_C_ID);
      expect(typeof res.body.score).toBe('number');
    });
  });

  // ── Batch update ─────────────────────────────────────────────────────────

  describe('POST /trust-score/batch-update', () => {
    it('returns updated and failed counts for all users', async () => {
      const res = await request(app.getHttpServer())
        .post('/trust-score/batch-update')
        .set('Authorization', 'Bearer user-a')
        .expect(200);

      expect(typeof res.body.updated).toBe('number');
      expect(typeof res.body.failed).toBe('number');
      expect(res.body.updated).toBeGreaterThanOrEqual(3);
      expect(res.body.failed).toBe(0);
    });
  });

  // ── Refresh query parameter ──────────────────────────────────────────────

  describe('Refresh query parameter', () => {
    it('forces a fresh calculation when refresh=true', async () => {
      const res = await request(app.getHttpServer())
        .get('/trust-score/me?refresh=true')
        .set('Authorization', 'Bearer user-a')
        .expect(200);

      expect(res.body.userId).toBe(USER_A_ID);
      expect(typeof res.body.score).toBe('number');
      expect(res.body.lastUpdated).toBeDefined();
    });

    it('forces fresh calculation for another user', async () => {
      const res = await request(app.getHttpServer())
        .get(`/trust-score/${USER_B_ID}?refresh=true`)
        .set('Authorization', 'Bearer user-a')
        .expect(200);

      expect(res.body.userId).toBe(USER_B_ID);
      expect(typeof res.body.score).toBe('number');
    });
  });

  // ── API key + Bearer combined authentication ─────────────────────────────

  describe('Combined authentication', () => {
    it('allows access with both Bearer token and x-api-key header', async () => {
      const res = await request(app.getHttpServer())
        .get('/trust-score/me')
        .set('Authorization', 'Bearer user-a')
        .set('X-Api-Key', 'valid-api-key')
        .expect(200);

      expect(res.body.userId).toBe(USER_A_ID);
      expect(typeof res.body.score).toBe('number');
    });
  });
});
