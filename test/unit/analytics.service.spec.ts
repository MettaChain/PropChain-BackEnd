import { AnalyticsService } from '../../src/analytics/analytics.service';

function req(
  overrides: Partial<{
    endpoint: string;
    method: string;
    statusCode: number;
    responseTime: number;
    userId: string | null;
  }> = {},
) {
  return {
    endpoint: '/properties',
    method: 'GET',
    statusCode: 200,
    responseTime: 100,
    userId: 'user-1',
    ...overrides,
  };
}

describe('AnalyticsService', () => {
  let service: AnalyticsService;

  beforeEach(() => {
    service = new AnalyticsService();
  });

  it('aggregates a normal window into the expected result shape', () => {
    service.record(req({ statusCode: 200, responseTime: 100 }));
    service.record(req({ statusCode: 500, responseTime: 300 }));
    service.record(
      req({
        endpoint: '/users',
        method: 'POST',
        statusCode: 201,
        responseTime: 50,
        userId: 'user-2',
      }),
    );

    const stats = service.getStats(60);

    expect(stats.totalRequests).toBe(3);
    expect(stats.totalErrors).toBe(1);
    expect(stats.overallErrorRate).toBeCloseTo(33.33, 1);
    expect(stats.avgResponseTime).toBe(150); // (100 + 300 + 50) / 3
    expect(Array.isArray(stats.topEndpoints)).toBe(true);
    expect(stats.topEndpoints.length).toBeGreaterThan(0);
    expect(stats.errorsByStatus.some((e) => e.statusCode === 500)).toBe(true);
    expect(stats.window).toBe('60m');
  });

  it('returns a zeroed shape for an empty window (no records)', () => {
    const stats = service.getStats(60);
    expect(stats.totalRequests).toBe(0);
    expect(stats.totalErrors).toBe(0);
    expect(stats.overallErrorRate).toBe(0);
    expect(stats.avgResponseTime).toBe(0);
    expect(stats.topEndpoints).toEqual([]);
    expect(stats.topUsers).toEqual([]);
    expect(stats.errorsByStatus).toEqual([]);
  });

  it('excludes all records for a reversed/invalid (negative) window', () => {
    service.record(req());
    // A negative window puts the cutoff in the future, so nothing qualifies.
    const negative = service.getStats(-30);
    expect(negative.totalRequests).toBe(0);
    expect(negative.topEndpoints).toEqual([]);
  });

  it('reset() clears recorded data', () => {
    service.record(req());
    expect(service.getStats(60).totalRequests).toBe(1);
    service.reset();
    expect(service.getStats(60).totalRequests).toBe(0);
  });
});
