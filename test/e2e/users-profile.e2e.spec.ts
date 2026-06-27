import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { PrismaService } from '../../src/database/prisma.service';
import { UsersController } from '../../src/users/users.controller';
import { UsersService } from '../../src/users/users.service';
import { ActivityLogService } from '../../src/users/activity-log.service';
import { SessionsService } from '../../src/sessions/sessions.service';
import { AuthService } from '../../src/auth/auth.service';

class FakePrismaService {
  users = new Map<string, any>();

  async $connect() {}
  async $disconnect() {}
  async $transaction(arr: any[]) { return Promise.all(arr); }

  activityLog = {
    create: async (args: any) => args.data,
  } as any;

  session = {
    findMany: async () => [],
    count: async () => 0,
    updateMany: async () => ({ count: 0 }),
  } as any;

  user = {
    create: async ({ data }: any) => {
      const id = data.id ?? Math.random().toString(36).slice(2, 10);
      const record = {
        id, ...data, role: data.role ?? 'USER',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        lastActivityAt: null, isVerified: false, isBlocked: false, isDeactivated: false,
        deactivatedAt: null, scheduledDeletionAt: null, twoFactorEnabled: false,
        twoFactorSecret: null, twoFactorBackupCodes: [], avatar: null, pendingEmail: null,
        emailVerificationToken: null, emailVerificationExpires: null, trustScore: 0,
        lastTrustScoreUpdate: null, preferredChannel: null, languagePreference: null,
        timezone: null, contactHours: null, referralCode: null, referredById: null,
      };
      this.users.set(id, record);
      return record;
    },
    findUnique: async ({ where, include }: any) => {
      if (!where) return null;
      let user: any = null;
      if (where.id) user = this.users.get(where.id) ?? null;
      if (!user && where.email) user = Array.from(this.users.values()).find((u) => u.email === where.email) ?? null;
      if (!user) return null;
      if (where.isDeactivated !== undefined && user.isDeactivated !== where.isDeactivated) return null;
      if (!include) return user;
      const result = { ...user };
      if (include.properties) result.properties = [];
      if (include.buyerTransactions) result.buyerTransactions = [];
      if (include.sellerTransactions) result.sellerTransactions = [];
      if (include._count) result._count = { properties: 0, buyerTransactions: 0, sellerTransactions: 0 };
      return result;
    },
    findFirst: async ({ where }: any) => {
      if (!where) return null;
      return Array.from(this.users.values()).find((u) => {
        for (const k of Object.keys(where)) {
          if (k === 'NOT') continue;
          if (u[k] !== where[k]) return false;
        }
        return true;
      }) ?? null;
    },
    update: async ({ where, data }: any) => {
      const user = this.users.get(where.id);
      const updated = { ...user, ...data, updatedAt: new Date().toISOString() };
      this.users.set(where.id, updated);
      return updated;
    },
  } as any;
}

describe('User profile e2e', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const fakePrisma = new FakePrismaService();
    // Create a test user
    const user = await fakePrisma.user.create({ data: { id: 'test-user-id', email: 'test@example.com' } });
    fakePrisma.users.set('test-user-id', { ...user, id: 'test-user-id' });

    const moduleRef = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        UsersService,
        ActivityLogService,
        SessionsService,
        { provide: PrismaService, useValue: fakePrisma as any },
        { provide: AuthService, useValue: { validateAccessToken: async () => ({ sub: 'test-user-id', email: 'test@example.com', role: 'USER' as any, type: 'access' }) } as any },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false }));
    await app.init();
  }, 20000);

  afterAll(async () => {
    await app.close();
  });

  it('gets profile', async () => {
    const res = await request(app.getHttpServer())
      .get('/users/me/profile')
      .set('Authorization', 'Bearer test')
      .expect(200);
    expect(res.body).toBeDefined();
  });

  it('updates profile', async () => {
    const res = await request(app.getHttpServer())
      .put('/users/me/profile')
      .set('Authorization', 'Bearer test')
      .send({ firstName: 'UpdatedName' })
      .expect(200);
    expect(res.body.firstName).toBe('UpdatedName');
  });

  it('updates and verifies profile persistence', async () => {
    await request(app.getHttpServer())
      .put('/users/me/profile')
      .set('Authorization', 'Bearer test')
      .send({ firstName: 'Alice', lastName: 'Wonderland' })
      .expect(200);
    const res = await request(app.getHttpServer())
      .get('/users/me/profile')
      .set('Authorization', 'Bearer test')
      .expect(200);
    expect(res.body.firstName).toBe('Alice');
    expect(res.body.lastName).toBe('Wonderland');
  });

  it('rejects unauthenticated profile access', async () => {
    await request(app.getHttpServer())
      .get('/users/me/profile')
      .expect(401);
  });
});
