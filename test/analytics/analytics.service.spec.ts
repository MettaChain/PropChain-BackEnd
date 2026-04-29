import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from '../../src/analytics/analytics.service';

describe('AnalyticsService', () => {
  let service: AnalyticsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AnalyticsService],
    }).compile();
    service = module.get(AnalyticsService);
  });

  it('returns empty stats with no records', () => {
    const stats = service.getStats();
    expect(stats.total).toBe(0);
    expect(stats.endpoints).toHaveLength(0);
  });

  it('records requests and returns stats', () => {
    service.record({
      endpoint: '/api/properties',
      method: 'GET',
      statusCode: 200,
      responseTime: 50,
    });
    service.record({
      endpoint: '/api/properties',
      method: 'GET',
      statusCode: 200,
      responseTime: 100,
    });
    service.record({ endpoint: '/api/users', method: 'GET', statusCode: 404, responseTime: 20 });

    const stats = service.getStats();
    expect(stats.total).toBe(3);
    expect(stats.endpoints[0].endpoint).toBe('GET /api/properties');
    expect(stats.endpoints[0].count).toBe(2);
    expect(stats.errors).toEqual(expect.arrayContaining([{ statusCode: 404, count: 1 }]));
  });

  it('resets stats', () => {
    service.record({ endpoint: '/api/test', method: 'GET', statusCode: 200, responseTime: 10 });
    service.reset();
    expect(service.getStats().total).toBe(0);
  });

  it('tracks average response time', () => {
    service.record({ endpoint: '/api/test', method: 'GET', statusCode: 200, responseTime: 100 });
    service.record({ endpoint: '/api/test', method: 'GET', statusCode: 200, responseTime: 200 });
    expect(service.getStats().avgResponseTime).toBe(150);
  });
});
