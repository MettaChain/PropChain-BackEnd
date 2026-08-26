/**
 * E2E test: Admin API – role rejection/acceptance, user management, fraud actions.
 *
 * Issue #1075 – Add e2e coverage for the admin API.
 *
 * Covers:
 *   - Unauthenticated callers are rejected from admin routes
 *   - USER role is rejected from all admin endpoints (403 Forbidden)
 *   - ADMIN role can access admin endpoints
 *   - User management: GET /admin/users, POST /admin/users/:id/block, POST /admin/users/:id/unblock
 *   - Fraud actions: GET /admin/fraud/alerts, POST /admin/fraud/users/:id/scan
 *   - Dashboard: GET /admin/dashboard
 *   - Email preview: GET /admin/email/preview/:templateName
 */

import {
  INestApplication,
  ValidationPipe,
  Injectable,
  CanActivate,
  ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { PrismaService } from '../../src/database/prisma.service';
import { AdminController } from '../../src/admin/admin.controller';
import { AdminService } from '../../src/admin/admin.service';
import { JwtAuthGuard } from '../../src/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../src/auth/guards/roles.guard';
import { EmailService } from '../../src/email/email.service';
import { ArchiveService } from '../../src/archive/archive.service';
import { CleanupService } from '../../src/database/cleanup.service';

// ── Role-aware mock guard ────────────────────────────────────────────────────
// Reads role from token prefix "role:<ROLE>" (e.g. "Bearer role:ADMIN")

@Injectable()
class RoleAwareMockGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const auth: string | undefined = req.headers['authorization'];
    if (!auth?.startsWith('Bearer ')) return false;
    const token = auth.slice(7);
    if (!token.startsWith('role:')) return false;
    const role = token.slice(5) as 'USER' | 'ADMIN' | 'AGENT';
    req.user = {
      sub: `${role.toLowerCase()}-test-id`,
      email: `${role.toLowerCase()}@example.com`,
      role,
      type: 'access',
    };
    req.authUser = req.user;
    return true;
  }
}

// ── Fake Prisma ──────────────────────────────────────────────────────────────

class FakePrismaService {
  users = new Map<string, any>();
  properties = new Map<string, any>();
  transactions = new Map<string, any>();
  fraudAlerts = new Map<string, any>();
  activityLogs: any[] = [];

  async $connect() {}
  async $disconnect() {}

  user = {
    count: async () => this.users.size,
    findMany: async ({ where, skip, take, _orderBy, select }: any) => {
      let items = Array.from(this.users.values());
      if (where?.role) items = items.filter((u) => u.role === where.role);
      if (where?.isBlocked !== undefined)
        items = items.filter((u) => u.isBlocked === where.isBlocked);
      if (where?.OR) {
        const search = where.OR[0]?.email?.contains;
        if (search) {
          items = items.filter(
            (u) =>
              u.email?.toLowerCase().includes(search.toLowerCase()) ||
              u.firstName?.toLowerCase().includes(search.toLowerCase()) ||
              u.lastName?.toLowerCase().includes(search.toLowerCase()),
          );
        }
      }
      items.sort((a, b) => (b.createdAt?.getTime?.() ?? 0) - (a.createdAt?.getTime?.() ?? 0));
      if (skip) items = items.slice(skip);
      if (take) items = items.slice(0, take);
      if (select) {
        items = items.map((u) => {
          const picked: any = {};
          for (const key of Object.keys(select)) {
            if (key in u) picked[key] = u[key];
          }
          return picked;
        });
      }
      return items;
    },
    findUnique: async ({ where, select }: any) => {
      const user = this.users.get(where.id) ?? null;
      if (!user) return null;
      if (select) {
        const picked: any = {};
        for (const key of Object.keys(select)) {
          if (key in user) picked[key] = user[key];
        }
        return picked;
      }
      return user;
    },
    update: async ({ where, data, select }: any) => {
      const user = this.users.get(where.id);
      if (!user) return null;
      Object.assign(user, data);
      if (select) {
        const picked: any = {};
        for (const key of Object.keys(select)) {
          if (key in user) picked[key] = user[key];
        }
        return picked;
      }
      return user;
    },
    updateMany: async ({ where, data }: any) => {
      let count = 0;
      for (const user of this.users.values()) {
        if (!where?.id?.in || where.id.in.includes(user.id)) {
          Object.assign(user, data);
          count++;
        }
      }
      return { count };
    },
  } as any;

  property = {
    count: async ({ where }: any = {}) => {
      let items = Array.from(this.properties.values());
      if (where?.status) items = items.filter((p) => p.status === where.status);
      return items.length;
    },
    findMany: async ({ where, _skip, take, _orderBy, _include }: any = {}) => {
      let items = Array.from(this.properties.values());
      if (where?.status) items = items.filter((p) => p.status === where.status);
      if (where?.id?.in) items = items.filter((p) => where.id.in.includes(p.id));
      if (take) items = items.slice(0, take);
      return items;
    },
    update: async ({ where, data }: any) => {
      const prop = this.properties.get(where.id);
      if (!prop) return null;
      Object.assign(prop, data);
      return prop;
    },
    updateMany: async ({ where, data }: any) => {
      let count = 0;
      for (const prop of this.properties.values()) {
        if (where?.id?.in && where.id.in.includes(prop.id)) {
          Object.assign(prop, data);
          count++;
        }
      }
      return { count };
    },
  } as any;

  transaction = {
    count: async ({ where }: any = {}) => {
      let items = Array.from(this.transactions.values());
      if (where?.status) items = items.filter((t) => t.status === where.status);
      return items.length;
    },
    aggregate: async ({ where }: any = {}) => {
      let items = Array.from(this.transactions.values());
      if (where?.status) items = items.filter((t) => t.status === where.status);
      if (where?.type) items = items.filter((t) => t.type === where.type);
      const sum = items.reduce((acc, t) => acc + (t.amount || 0), 0);
      return { _sum: { amount: sum } };
    },
    findMany: async ({ where, _skip, take }: any = {}) => {
      let items = Array.from(this.transactions.values());
      if (where?.status) items = items.filter((t) => t.status === where.status);
      if (take) items = items.slice(0, take);
      return items;
    },
  } as any;

  fraudAlert = {
    count: async ({ where }: any = {}) => {
      let items = Array.from(this.fraudAlerts.values());
      if (where?.status) items = items.filter((a) => a.status === where.status);
      if (where?.severity) items = items.filter((a) => a.severity === where.severity);
      if (where?.autoBlocked !== undefined)
        items = items.filter((a) => a.autoBlocked === where.autoBlocked);
      return items.length;
    },
    groupBy: async () => [],
    findMany: async ({ _where, _skip, take }: any = {}) => {
      let items = Array.from(this.fraudAlerts.values());
      if (take) items = items.slice(0, take);
      return items;
    },
    findUnique: async ({ where }: any) => this.fraudAlerts.get(where.id) ?? null,
    update: async ({ where, data }: any) => {
      const alert = this.fraudAlerts.get(where.id);
      if (!alert) return null;
      Object.assign(alert, data);
      return alert;
    },
  } as any;

  activityLog = {
    create: async ({ data }: any) => {
      const record = { id: `log-${Date.now()}`, ...data, createdAt: new Date() };
      this.activityLogs.push(record);
      return record;
    },
    createMany: async ({ data }: any) => {
      for (const item of data) {
        this.activityLogs.push({ id: `log-${Date.now()}`, ...item, createdAt: new Date() });
      }
      return { count: data.length };
    },
  } as any;

  session = {
    updateMany: async () => ({ count: 0 }),
  } as any;

  fraudInvestigationNote = {
    create: async ({ data }: any) => ({ id: `note-${Date.now()}`, ...data }),
  } as any;
}

// ── Fake AdminService ────────────────────────────────────────────────────────

class FakeAdminService {
  private prisma: FakePrismaService;
  constructor(prisma: FakePrismaService) {
    this.prisma = prisma;
  }

  async getDashboard() {
    const [totalUsers, blockedUsers, totalProperties, pendingProperties, activeProperties] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.user.count({ where: { isBlocked: true } }),
        this.prisma.property.count(),
        this.prisma.property.count({ where: { status: 'PENDING' } }),
        this.prisma.property.count({ where: { status: 'ACTIVE' } }),
      ]);
    const [completedTransactions, pendingTransactions, salesAggregate, rentAggregate] =
      await Promise.all([
        this.prisma.transaction.count({ where: { status: 'COMPLETED' } }),
        this.prisma.transaction.count({ where: { status: 'PENDING' } }),
        this.prisma.transaction.aggregate({
          where: { status: 'COMPLETED', type: 'SALE' },
          _sum: { amount: true },
        }),
        this.prisma.transaction.aggregate({
          where: { status: 'COMPLETED', type: 'TRANSFER' },
          _sum: { amount: true },
        }),
      ]);
    return {
      userStats: { totalUsers, blockedUsers, activeUsers: totalUsers - blockedUsers },
      propertyStats: { totalProperties, pendingProperties, activeProperties },
      revenueMetrics: {
        totalSalesRevenue: salesAggregate._sum.amount ?? 0,
        totalTransferRevenue: rentAggregate._sum.amount ?? 0,
      },
      systemHealth: { completedTransactions, pendingTransactions },
    };
  }

  async listUsers(query: any) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const where: any = { role: query.role };
    if (query.search) {
      where.OR = [{ email: { contains: query.search, mode: 'insensitive' } }];
    }
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          isVerified: true,
          isBlocked: true,
          createdAt: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { total, page, limit, items, nextCursor: null, previousCursor: null };
  }

  async setUserBlockedState(userId: string, blocked: boolean) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { isBlocked: blocked },
      select: { id: true, email: true, isBlocked: true },
    });
  }

  async listFraudAlerts(query: any) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const items = await this.prisma.fraudAlert.findMany({ skip: (page - 1) * limit, take: limit });
    return { items, total: items.length, page, limit, totalPages: 1 };
  }

  async getFraudAlertsSummary() {
    const [open, investigating, resolved, dismissed, autoBlocked, critical, high] =
      await Promise.all([
        this.prisma.fraudAlert.count({ where: { status: 'OPEN' } }),
        this.prisma.fraudAlert.count({ where: { status: 'INVESTIGATING' } }),
        this.prisma.fraudAlert.count({ where: { status: 'RESOLVED' } }),
        this.prisma.fraudAlert.count({ where: { status: 'DISMISSED' } }),
        this.prisma.fraudAlert.count({ where: { autoBlocked: true } }),
        this.prisma.fraudAlert.count({ where: { severity: 'CRITICAL' } }),
        this.prisma.fraudAlert.count({ where: { severity: 'HIGH' } }),
      ]);
    return {
      statuses: { open, investigating, resolved, dismissed },
      severity: { critical, high },
      autoBlocked,
      byPattern: [],
    };
  }

  async scanUserForFraud(userId: string, _actorId: string) {
    return { userId, generatedAlerts: [] };
  }

  async updateUser(userId: string, payload: any) {
    return this.prisma.user.update({
      where: { id: userId },
      data: payload,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        isVerified: true,
        isBlocked: true,
        updatedAt: true,
      },
    });
  }

  async approveProperty(propertyId: string) {
    return this.prisma.property.update({ where: { id: propertyId }, data: { status: 'ACTIVE' } });
  }

  async rejectProperty(propertyId: string) {
    return this.prisma.property.update({ where: { id: propertyId }, data: { status: 'ARCHIVED' } });
  }

  async getModerationQueue(query: any) {
    const items = await this.prisma.property.findMany({
      where: { status: query.status ?? 'PENDING' },
      take: 20,
    });
    return {
      total: items.length,
      page: 1,
      limit: 20,
      items,
      nextCursor: null,
      previousCursor: null,
    };
  }

  async monitorTransactions(query: any) {
    const items = await this.prisma.transaction.findMany({ where: query, take: 20 });
    return {
      total: items.length,
      page: 1,
      limit: 20,
      items,
      nextCursor: null,
      previousCursor: null,
    };
  }

  async transactionMonitoringSummary() {
    const [pending, completed, cancelled, agg] = await Promise.all([
      this.prisma.transaction.count({ where: { status: 'PENDING' } }),
      this.prisma.transaction.count({ where: { status: 'COMPLETED' } }),
      this.prisma.transaction.count({ where: { status: 'CANCELLED' } }),
      this.prisma.transaction.aggregate({ where: { status: 'COMPLETED' }, _sum: { amount: true } }),
    ]);
    return { pending, completed, cancelled, totalCompletedValue: agg._sum.amount ?? 0 };
  }
}

// ── Test suite ───────────────────────────────────────────────────────────────

describe('Admin API (e2e)', () => {
  let app: INestApplication;
  let fakePrisma: FakePrismaService;
  let adminService: FakeAdminService;

  beforeAll(async () => {
    fakePrisma = new FakePrismaService();

    // Seed users
    const now = new Date();
    fakePrisma.users.set('admin-1', {
      id: 'admin-1',
      email: 'admin@example.com',
      firstName: 'Admin',
      lastName: 'User',
      role: 'ADMIN',
      isVerified: true,
      isBlocked: false,
      createdAt: now,
      updatedAt: now,
    });
    fakePrisma.users.set('user-1', {
      id: 'user-1',
      email: 'regular@example.com',
      firstName: 'Regular',
      lastName: 'User',
      role: 'USER',
      isVerified: true,
      isBlocked: false,
      createdAt: now,
      updatedAt: now,
    });
    fakePrisma.users.set('blocked-user-1', {
      id: 'blocked-user-1',
      email: 'blocked@example.com',
      firstName: 'Blocked',
      lastName: 'User',
      role: 'USER',
      isVerified: true,
      isBlocked: true,
      createdAt: now,
      updatedAt: now,
    });

    // Seed fraud alert
    fakePrisma.fraudAlerts.set('alert-1', {
      id: 'alert-1',
      userId: 'user-1',
      pattern: 'EXCESSIVE_FAILED_LOGINS',
      severity: 'HIGH',
      status: 'OPEN',
      score: 75,
      title: 'Repeated failed logins',
      description: 'Multiple failed login attempts detected',
      autoBlocked: false,
      occurrenceCount: 3,
      lastDetectedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    adminService = new FakeAdminService(fakePrisma);

    const moduleRef = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        Reflector,
        RolesGuard,
        { provide: PrismaService, useValue: fakePrisma as any },
        { provide: AdminService, useValue: adminService as any },
        { provide: EmailService, useValue: { sendEmail: async () => ({}) } },
        {
          provide: ArchiveService,
          useValue: {
            listArchiveFiles: async () => [],
            getLastSummary: async () => null,
            runArchival: async () => ({ archived: 0 }),
            restoreFromArchive: async () => ({ restored: 0, errors: [] }),
          },
        },
        {
          provide: CleanupService,
          useValue: {
            getLastSummary: async () => null,
            performCleanup: async () => ({ cleaned: 0 }),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(new RoleAwareMockGuard())
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

  // ── Unauthenticated access ──────────────────────────────────────────────

  describe('Unauthenticated access', () => {
    it('rejects GET /admin/dashboard without a token', async () => {
      await request(app.getHttpServer())
        .get('/admin/dashboard')
        .expect((r: any) => {
          expect([401, 403]).toContain(r.status);
        });
    });

    it('rejects GET /admin/users without a token', async () => {
      await request(app.getHttpServer())
        .get('/admin/users')
        .expect((r: any) => {
          expect([401, 403]).toContain(r.status);
        });
    });

    it('rejects POST /admin/users/:id/block without a token', async () => {
      await request(app.getHttpServer())
        .post('/admin/users/user-1/block')
        .expect((r: any) => {
          expect([401, 403]).toContain(r.status);
        });
    });

    it('rejects GET /admin/fraud/alerts without a token', async () => {
      await request(app.getHttpServer())
        .get('/admin/fraud/alerts')
        .expect((r: any) => {
          expect([401, 403]).toContain(r.status);
        });
    });

    it('rejects POST /admin/fraud/users/:id/scan without a token', async () => {
      await request(app.getHttpServer())
        .post('/admin/fraud/users/user-1/scan')
        .expect((r: any) => {
          expect([401, 403]).toContain(r.status);
        });
    });
  });

  // ── USER role rejection ─────────────────────────────────────────────────

  describe('USER role rejected from admin endpoints', () => {
    it('USER cannot access GET /admin/dashboard', async () => {
      await request(app.getHttpServer())
        .get('/admin/dashboard')
        .set('Authorization', 'Bearer role:USER')
        .expect(403);
    });

    it('USER cannot access GET /admin/users', async () => {
      await request(app.getHttpServer())
        .get('/admin/users')
        .set('Authorization', 'Bearer role:USER')
        .expect(403);
    });

    it('USER cannot access POST /admin/users/:id/block', async () => {
      await request(app.getHttpServer())
        .post('/admin/users/user-1/block')
        .set('Authorization', 'Bearer role:USER')
        .expect(403);
    });

    it('USER cannot access POST /admin/users/:id/unblock', async () => {
      await request(app.getHttpServer())
        .post('/admin/users/blocked-user-1/unblock')
        .set('Authorization', 'Bearer role:USER')
        .expect(403);
    });

    it('USER cannot access GET /admin/fraud/alerts', async () => {
      await request(app.getHttpServer())
        .get('/admin/fraud/alerts')
        .set('Authorization', 'Bearer role:USER')
        .expect(403);
    });

    it('USER cannot access GET /admin/fraud/alerts/summary', async () => {
      await request(app.getHttpServer())
        .get('/admin/fraud/alerts/summary')
        .set('Authorization', 'Bearer role:USER')
        .expect(403);
    });

    it('USER cannot access POST /admin/fraud/users/:id/scan', async () => {
      await request(app.getHttpServer())
        .post('/admin/fraud/users/user-1/scan')
        .set('Authorization', 'Bearer role:USER')
        .expect(403);
    });

    it('USER cannot access GET /admin/transactions/monitoring', async () => {
      await request(app.getHttpServer())
        .get('/admin/transactions/monitoring')
        .set('Authorization', 'Bearer role:USER')
        .expect(403);
    });

    it('USER cannot access GET /admin/properties/moderation/queue', async () => {
      await request(app.getHttpServer())
        .get('/admin/properties/moderation/queue')
        .set('Authorization', 'Bearer role:USER')
        .expect(403);
    });
  });

  // ── ADMIN access: user management ──────────────────────────────────────

  describe('ADMIN access: user management', () => {
    it('ADMIN can list users', async () => {
      const res = await request(app.getHttpServer())
        .get('/admin/users')
        .set('Authorization', 'Bearer role:ADMIN')
        .expect(200);

      expect(res.body).toHaveProperty('total');
      expect(res.body).toHaveProperty('items');
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(res.body.items.length).toBeGreaterThanOrEqual(1);
    });

    it('ADMIN can block a user', async () => {
      const res = await request(app.getHttpServer())
        .post('/admin/users/user-1/block')
        .set('Authorization', 'Bearer role:ADMIN')
        .expect(201);

      expect(res.body).toHaveProperty('id', 'user-1');
      expect(res.body).toHaveProperty('isBlocked', true);

      // Verify the state change persisted
      const user = fakePrisma.users.get('user-1');
      expect(user.isBlocked).toBe(true);
    });

    it('ADMIN can unblock a user', async () => {
      const res = await request(app.getHttpServer())
        .post('/admin/users/blocked-user-1/unblock')
        .set('Authorization', 'Bearer role:ADMIN')
        .expect(201);

      expect(res.body).toHaveProperty('id', 'blocked-user-1');
      expect(res.body).toHaveProperty('isBlocked', false);

      // Verify the state change persisted
      const user = fakePrisma.users.get('blocked-user-1');
      expect(user.isBlocked).toBe(false);
    });
  });

  // ── ADMIN access: fraud actions ────────────────────────────────────────

  describe('ADMIN access: fraud actions', () => {
    it('ADMIN can list fraud alerts', async () => {
      const res = await request(app.getHttpServer())
        .get('/admin/fraud/alerts')
        .set('Authorization', 'Bearer role:ADMIN')
        .expect(200);

      expect(res.body).toHaveProperty('items');
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(res.body.items.length).toBeGreaterThanOrEqual(1);
    });

    it('ADMIN can get fraud alert summary', async () => {
      const res = await request(app.getHttpServer())
        .get('/admin/fraud/alerts/summary')
        .set('Authorization', 'Bearer role:ADMIN')
        .expect(200);

      expect(res.body).toHaveProperty('statuses');
      expect(res.body).toHaveProperty('severity');
      expect(res.body).toHaveProperty('autoBlocked');
    });

    it('ADMIN can scan a user for fraud', async () => {
      const res = await request(app.getHttpServer())
        .post('/admin/fraud/users/user-1/scan')
        .set('Authorization', 'Bearer role:ADMIN')
        .expect(201);

      expect(res.body).toHaveProperty('userId', 'user-1');
      expect(res.body).toHaveProperty('generatedAlerts');
      expect(Array.isArray(res.body.generatedAlerts)).toBe(true);
    });
  });

  // ── ADMIN access: dashboard ────────────────────────────────────────────

  describe('ADMIN access: dashboard', () => {
    it('ADMIN can access the dashboard', async () => {
      const res = await request(app.getHttpServer())
        .get('/admin/dashboard')
        .set('Authorization', 'Bearer role:ADMIN')
        .expect(200);

      expect(res.body).toHaveProperty('userStats');
      expect(res.body.userStats).toHaveProperty('totalUsers');
      expect(res.body).toHaveProperty('propertyStats');
      expect(res.body).toHaveProperty('revenueMetrics');
      expect(res.body).toHaveProperty('systemHealth');
    });
  });

  // ── ADMIN access: email preview ────────────────────────────────────────

  describe('ADMIN access: email preview', () => {
    it('ADMIN can preview a valid email template', async () => {
      const res = await request(app.getHttpServer())
        .get('/admin/email/preview/password-reset')
        .set('Authorization', 'Bearer role:ADMIN')
        .expect(200);

      expect(res.body).toHaveProperty('templateName', 'password-reset');
      expect(res.body).toHaveProperty('sampleData');
      expect(res.body).toHaveProperty('note');
    });

    it('ADMIN gets 404 for unknown template', async () => {
      await request(app.getHttpServer())
        .get('/admin/email/preview/nonexistent-template')
        .set('Authorization', 'Bearer role:ADMIN')
        .expect(404);
    });
  });

  // ── ADMIN access: transaction monitoring ───────────────────────────────

  describe('ADMIN access: transaction monitoring', () => {
    it('ADMIN can access transaction monitoring', async () => {
      const res = await request(app.getHttpServer())
        .get('/admin/transactions/monitoring')
        .set('Authorization', 'Bearer role:ADMIN')
        .expect(200);

      expect(res.body).toHaveProperty('items');
      expect(res.body).toHaveProperty('total');
    });

    it('ADMIN can access transaction monitoring summary', async () => {
      const res = await request(app.getHttpServer())
        .get('/admin/transactions/monitoring/summary')
        .set('Authorization', 'Bearer role:ADMIN')
        .expect(200);

      expect(res.body).toHaveProperty('pending');
      expect(res.body).toHaveProperty('completed');
      expect(res.body).toHaveProperty('cancelled');
      expect(res.body).toHaveProperty('totalCompletedValue');
    });
  });

  // ── ADMIN access: property moderation ──────────────────────────────────

  describe('ADMIN access: property moderation', () => {
    it('ADMIN can access the moderation queue', async () => {
      const res = await request(app.getHttpServer())
        .get('/admin/properties/moderation/queue')
        .set('Authorization', 'Bearer role:ADMIN')
        .expect(200);

      expect(res.body).toHaveProperty('items');
      expect(res.body).toHaveProperty('total');
    });
  });
});
