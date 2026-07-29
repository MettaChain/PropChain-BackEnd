/**
 * E2E test: Sessions management workflow.
 *
 * Issue #912 – Implement end-to-end tests for all major API workflows.
 *
 * Verifies:
 *   - List sessions
 *   - Rename a session
 *   - Revoke a specific session
 *   - Revoke all sessions
 *   - Auth enforcement
 */

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
import { SessionsController } from '../../src/sessions/sessions.controller';
import { SessionsService } from '../../src/sessions/sessions.service';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../../src/auth/guards/jwt-auth.guard';
import { AuthUserPayload } from '../../src/auth/types/auth-user.type';

const TEST_USER_ID = 'sessions-user-001';

@Injectable()
class MockJwtAuthGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    if (!req.headers['authorization']) return false;
    const user: AuthUserPayload = {
      sub: TEST_USER_ID,
      email: 'sessions@example.com',
      role: 'USER',
      type: 'access',
    };
    req.user = user;
    req.authUser = user;
    return true;
  }
}

// ── Minimal Prisma fake ───────────────────────────────────────────────────────

class FakePrismaService {
  sessions = new Map<string, any>();
  blacklistedTokens = new Map<string, any>();
  private counter = 0;

  async $connect() {}
  async $disconnect() {}
  async $transaction(fn: any) {
    if (typeof fn === 'function') return fn(this);
    return Promise.all(fn);
  }

  session = {
    count: async ({ where }: any) => {
      let items = Array.from(this.sessions.values());
      if (where?.userId) items = items.filter((s) => s.userId === where.userId);
      if (where?.isRevoked !== undefined)
        items = items.filter((s) => s.isRevoked === where.isRevoked);
      if (where?.expiresAt?.gt) items = items.filter((s) => s.expiresAt > where.expiresAt.gt);
      return items.length;
    },
    create: async ({ data }: any) => {
      const id = `sess-${++this.counter}`;
      const rec = { id, ...data, isRevoked: false, createdAt: new Date() };
      this.sessions.set(id, rec);
      return rec;
    },
    findUnique: async ({ where }: any) => this.sessions.get(where.id) ?? null,
    findFirst: async ({ where }: any) => {
      return (
        Array.from(this.sessions.values()).find((s) => {
          if (where?.accessTokenJti && s.accessTokenJti !== where.accessTokenJti) return false;
          return true;
        }) ?? null
      );
    },
    findMany: async ({ where }: any) => {
      let items = Array.from(this.sessions.values());
      if (where?.userId) items = items.filter((s) => s.userId === where.userId);
      if (where?.isRevoked !== undefined)
        items = items.filter((s) => s.isRevoked === where.isRevoked);
      return items;
    },
    update: async ({ where, data }: any) => {
      const s = this.sessions.get(where.id);
      if (!s) throw new Error('Session not found');
      const updated = { ...s, ...data };
      this.sessions.set(where.id, updated);
      return updated;
    },
    updateMany: async ({ where, data }: any) => {
      let count = 0;
      for (const [id, s] of this.sessions) {
        if (where?.userId && s.userId !== where.userId) continue;
        if (where?.isRevoked !== undefined && s.isRevoked !== where.isRevoked) continue;
        if (where?.id?.not && id === where.id.not) continue;
        this.sessions.set(id, { ...s, ...data });
        count++;
      }
      return { count };
    },
    deleteMany: async () => ({ count: 0 }),
  } as any;

  blacklistedToken = {
    findUnique: async () => null,
    findFirst: async () => null,
    create: async ({ data }: any) => data,
    createMany: async () => ({ count: 0 }),
    count: async () => 0,
  } as any;
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('Sessions management (e2e)', () => {
  let app: INestApplication;
  let fakePrisma: FakePrismaService;
  let sessionId: string;

  beforeAll(async () => {
    fakePrisma = new FakePrismaService();

    // Pre-seed two sessions for the test user
    const s1 = await fakePrisma.session.create({
      data: {
        userId: TEST_USER_ID,
        accessTokenJti: 'jti-access-001',
        refreshTokenJti: 'jti-refresh-001',
        ipAddress: '127.0.0.1',
        userAgent: 'Jest/1.0',
        displayName: 'Test Session 1',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        deviceInfo: {},
        geoLocation: {},
      },
    });
    sessionId = s1.id;

    await fakePrisma.session.create({
      data: {
        userId: TEST_USER_ID,
        accessTokenJti: 'jti-access-002',
        refreshTokenJti: 'jti-refresh-002',
        ipAddress: '127.0.0.1',
        userAgent: 'Jest/1.0',
        displayName: 'Test Session 2',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        deviceInfo: {},
        geoLocation: {},
      },
    });

    const moduleRef = await Test.createTestingModule({
      controllers: [SessionsController],
      providers: [
        SessionsService,
        { provide: PrismaService, useValue: fakePrisma as any },
        {
          provide: ConfigService,
          useValue: { get: (key: string, def: any) => def },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(new MockJwtAuthGuard())
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

  it('lists sessions for the current user', async () => {
    const res = await request(app.getHttpServer())
      .get('/sessions')
      .set('Authorization', 'Bearer valid')
      .expect(200);

    expect(res.body.sessions).toBeInstanceOf(Array);
    expect(res.body.sessions.length).toBeGreaterThanOrEqual(2);
    expect(typeof res.body.activeCount).toBe('number');
    expect(typeof res.body.revokedCount).toBe('number');
  });

  it('retrieves a specific session by ID', async () => {
    const res = await request(app.getHttpServer())
      .get(`/sessions/${sessionId}`)
      .set('Authorization', 'Bearer valid')
      .expect(200);

    expect(res.body.id).toBe(sessionId);
    expect(res.body.displayName).toBe('Test Session 1');
  });

  it('returns 404 for a non-existent session', async () => {
    await request(app.getHttpServer())
      .get('/sessions/nonexistent-session-id')
      .set('Authorization', 'Bearer valid')
      .expect(404);
  });

  it('renames a session', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/sessions/${sessionId}`)
      .set('Authorization', 'Bearer valid')
      .send({ displayName: 'Renamed Session' })
      .expect(200);

    expect(res.body.displayName).toBe('Renamed Session');
  });

  it('revokes a specific session', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/sessions/${sessionId}`)
      .set('Authorization', 'Bearer valid')
      .expect(200);

    expect(res.body.message).toContain('revoked');
    expect(res.body.sessionId).toBe(sessionId);
  });

  it('revokes all sessions', async () => {
    const res = await request(app.getHttpServer())
      .delete('/sessions')
      .set('Authorization', 'Bearer valid')
      .expect(200);

    expect(res.body.message).toContain('revoked');
    expect(typeof res.body.revokedCount).toBe('number');
  });

  it('rejects session list without auth', async () => {
    await request(app.getHttpServer())
      .get('/sessions')
      .expect((res) => {
        // NestJS returns 403 when CanActivate.canActivate() returns false;
        // 401 when an exception is thrown. Both indicate denied access.
        expect([401, 403]).toContain(res.status);
      });
  });
});
