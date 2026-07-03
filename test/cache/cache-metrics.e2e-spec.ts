import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/database/prisma.service';
import { CacheMonitoringService } from '../../src/cache/cache-monitoring.service';

class FakePrismaService {
  users = new Map<string, any>();
  blacklistedToken = new Map<string, any>();

  async $connect() {}
  async $disconnect() {}

  user = {
    findUnique: async ({ where }: any) => {
      if (where?.id) return this.users.get(where.id) ?? null;
      if (where?.email)
        return Array.from(this.users.values()).find((u) => u.email === where.email) ?? null;
      return null;
    },
    update: async ({ where, data }: any) => {
      const user = this.users.get(where.id);
      const updated = { ...user, ...data };
      this.users.set(where.id, updated);
      return updated;
    },
  } as any;
}

describe('CacheMetricsInterceptor e2e — singleton verification', () => {
  let app: INestApplication;
  let monitoringService: CacheMonitoringService;
  let fakePrisma: FakePrismaService;

  beforeAll(async () => {
    fakePrisma = new FakePrismaService();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(fakePrisma as any)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();

    monitoringService = app.get(CacheMonitoringService);
    monitoringService.resetMetrics();
  }, 20000);

  afterAll(async () => {
    await app.close();
  });

  it('records metrics after an HTTP request', async () => {
    const metricsBefore = monitoringService.getMetrics();
    expect(metricsBefore.totalRequests).toBe(0);

    await request(app.getHttpServer()).get('/api/properties').expect(200);

    const metricsAfter = monitoringService.getMetrics();
    expect(metricsAfter.totalRequests).toBeGreaterThanOrEqual(1);
    expect(metricsAfter.avgResponseTime).toBeGreaterThan(0);
  });

  it('accumulates metrics across multiple requests', async () => {
    monitoringService.resetMetrics();

    await request(app.getHttpServer()).get('/api/properties');
    await request(app.getHttpServer()).get('/api/properties');
    await request(app.getHttpServer()).get('/api/properties');

    const metrics = monitoringService.getMetrics();
    expect(metrics.totalRequests).toBeGreaterThanOrEqual(3);
    expect(metrics.avgResponseTime).toBeGreaterThan(0);
  });
});
