import { AnalyticsService } from '../../src/analytics/analytics.service';
import { PrismaService } from '../../src/database/prisma.service';

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

function createService() {
  const mockPrisma = {
    requestLog: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  } as unknown as PrismaService;

  // Stub setInterval so the periodic flush timer doesn't run in tests
  const mockTimer = { unref: jest.fn() } as any;
  jest.spyOn(global, 'setInterval').mockReturnValue(mockTimer);
  jest.spyOn(global, 'clearInterval').mockImplementation(() => {});

  const service = new AnalyticsService(mockPrisma);
  return { service, prisma: mockPrisma as jest.Mocked<Partial<PrismaService>> };
}

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let prisma: jest.Mocked<Partial<PrismaService>>;

  beforeEach(() => {
    const result = createService();
    service = result.service;
    prisma = result.prisma;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('aggregates a normal window into the expected result shape', async () => {
    // Pre-populate the database with records via the mock
    const now = new Date();
    (prisma.requestLog!.findMany as jest.Mock).mockResolvedValue([
      {
        endpoint: '/properties',
        method: 'GET',
        statusCode: 200,
        responseTime: 100,
        userId: 'user-1',
        timestamp: now,
      },
      {
        endpoint: '/properties',
        method: 'GET',
        statusCode: 500,
        responseTime: 300,
        userId: 'user-1',
        timestamp: now,
      },
      {
        endpoint: '/users',
        method: 'POST',
        statusCode: 201,
        responseTime: 50,
        userId: 'user-2',
        timestamp: now,
      },
    ]);

    const stats = await service.getStats(60);

    expect(stats.totalRequests).toBe(3);
    expect(stats.totalErrors).toBe(1);
    expect(stats.overallErrorRate).toBeCloseTo(33.33, 1);
    expect(stats.avgResponseTime).toBe(150); // (100 + 300 + 50) / 3
    expect(Array.isArray(stats.topEndpoints)).toBe(true);
    expect(stats.topEndpoints.length).toBeGreaterThan(0);
    expect(stats.errorsByStatus.some((e) => e.statusCode === 500)).toBe(true);
    expect(stats.window).toBe('60m');
  });

  it('returns a zeroed shape for an empty window (no records)', async () => {
    const stats = await service.getStats(60);
    expect(stats.totalRequests).toBe(0);
    expect(stats.totalErrors).toBe(0);
    expect(stats.overallErrorRate).toBe(0);
    expect(stats.avgResponseTime).toBe(0);
    expect(stats.topEndpoints).toEqual([]);
    expect(stats.topUsers).toEqual([]);
    expect(stats.errorsByStatus).toEqual([]);
  });

  it('excludes all records for a reversed/invalid (negative) window', async () => {
    // A negative window puts the cutoff in the future, so nothing qualifies.
    const negative = await service.getStats(-30);
    expect(negative.totalRequests).toBe(0);
    expect(negative.topEndpoints).toEqual([]);
  });

  it('reset() clears recorded data', async () => {
    service.record(req());
    // Flush to the mock DB
    await service.flush();

    await service.reset();

    expect(prisma.requestLog!.deleteMany).toHaveBeenCalled();
  });
});
