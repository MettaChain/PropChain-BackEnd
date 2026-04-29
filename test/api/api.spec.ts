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

describe('Performance tests', () => {
  it('AnalyticsService handles 1000 records within 50ms', () => {
    const service = new AnalyticsService();
    const start = Date.now();
    for (let i = 0; i < 1000; i++) {
      service.record({
        endpoint: `/api/route${i % 10}`,
        method: 'GET',
        statusCode: 200,
        responseTime: i,
      });
    }
    service.getStats();
    expect(Date.now() - start).toBeLessThan(50);
  });

  it('CacheMonitoringService handles 1000 hits within 10ms', () => {
    const monitoring = new CacheMonitoringService();
    const start = Date.now();
    for (let i = 0; i < 1000; i++) monitoring.recordHit();
    expect(Date.now() - start).toBeLessThan(10);
    expect(monitoring.getMetrics().hits).toBe(1000);
  });
});

// Import needed for performance test
import { CacheMonitoringService } from '../../src/cache/cache-monitoring.service';
