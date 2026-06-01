import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from '../../src/app.controller';
import { AnalyticsService } from '../../src/analytics/analytics.service';
import { AnalyticsInterceptor } from '../../src/analytics/analytics.interceptor';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';

describe('AppController (endpoint tests)', () => {
  let controller: AppController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
    }).compile();
    controller = module.get(AppController);
  });

  it('GET / returns welcome message', () => {
    expect(controller.getHello()).toBe('Welcome to PropChain API');
  });

  it('GET /health returns OK status', () => {
    const result = controller.health();
    expect(result.status).toBe('OK');
    expect(result.timestamp).toBeDefined();
  });
});

describe('AnalyticsInterceptor (integration test)', () => {
  let analytics: AnalyticsService;
  let interceptor: AnalyticsInterceptor;

  beforeEach(() => {
    analytics = new AnalyticsService();
    interceptor = new AnalyticsInterceptor(analytics);
  });

  it('records request on response', (done) => {
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({ path: '/api/test', method: 'GET' }),
        getResponse: () => ({ statusCode: 200 }),
      }),
    } as unknown as ExecutionContext;
    const next: CallHandler = { handle: () => of('ok') };

    interceptor.intercept(ctx, next).subscribe(() => {
      const stats = analytics.getStats();
      expect(stats.total).toBe(1);
      expect(stats.endpoints[0].endpoint).toBe('GET /api/test');
      done();
    });
  });
});

describe('Analytics behavior', () => {
  it('collects metrics for repeated requests', () => {
    const service = new AnalyticsService();

    for (let i = 0; i < 1000; i++) {
      service.record({
        endpoint: `/api/route${i % 10}`,
        method: 'GET',
        statusCode: 200,
        responseTime: i,
      });
    }

    const stats = service.getStats();
    expect(stats.total).toBe(1000);
    expect(stats.endpoints.length).toBeGreaterThan(0);
    expect(stats.endpoints.some((item) => item.endpoint === 'GET /api/route0')).toBe(true);
  });
});

import { CacheMonitoringService } from '../../src/cache/cache-monitoring.service';

describe('CacheMonitoringService', () => {
  it('tracks hits correctly', async () => {
    const monitoring = new CacheMonitoringService();

    for (let i = 0; i < 1000; i++) {
      await monitoring.recordHit();
    }

    expect(monitoring.getMetrics().hits).toBe(1000);
    expect(monitoring.getMetrics().misses).toBe(0);
  });
});
