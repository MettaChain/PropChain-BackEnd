import { AnalyticsService } from './analytics.service';
import { PrismaService } from '../database/prisma.service';

interface MockPrisma {
  requestLog: {
    createMany: jest.Mock;
    findMany: jest.Mock;
    deleteMany: jest.Mock;
  };
}

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let prisma: MockPrisma;

  /** Collects data passed to createMany for assertions. */
  let createManySink: any[];

  beforeEach(() => {
    createManySink = [];

    prisma = {
      requestLog: {
        createMany: jest.fn().mockImplementation(({ data }) => {
          createManySink.push(...data);
          return Promise.resolve({ count: data.length });
        }),
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };

    // Stub setInterval so the periodic flush timer doesn't run in tests
    const mockTimer = { unref: jest.fn() } as any;
    jest.spyOn(global, 'setInterval').mockReturnValue(mockTimer);
    jest.spyOn(global, 'clearInterval').mockImplementation(() => {});

    service = new AnalyticsService(prisma as unknown as PrismaService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ── record() and flush() ────────────────────────────────────────────────

  describe('record()', () => {
    it('buffers records without immediately writing to the database', () => {
      service.record({
        endpoint: '/api/properties',
        method: 'GET',
        statusCode: 200,
        responseTime: 42,
        userId: null,
      });

      expect(prisma.requestLog.createMany).not.toHaveBeenCalled();
    });

    it('flushes to the database when buffer reaches MAX_BUFFER_SIZE', async () => {
      // The MAX_BUFFER_SIZE is 500 (private). Simulate by calling record 500 times.
      for (let i = 0; i < 500; i++) {
        service.record({
          endpoint: `/api/test/${i}`,
          method: 'GET',
          statusCode: 200,
          responseTime: 10,
          userId: null,
        });
      }

      // flush() should have been triggered
      expect(prisma.requestLog.createMany).toHaveBeenCalled();
      expect(createManySink).toHaveLength(500);
    });
  });

  describe('flush()', () => {
    it('persists buffered records to the database', async () => {
      service.record({
        endpoint: '/api/properties',
        method: 'GET',
        statusCode: 200,
        responseTime: 50,
        userId: 'user-1',
      });
      service.record({
        endpoint: '/api/auth/login',
        method: 'POST',
        statusCode: 401,
        responseTime: 120,
        userId: null,
      });

      await service.flush();

      expect(prisma.requestLog.createMany).toHaveBeenCalledTimes(1);
      expect(createManySink).toHaveLength(2);
      expect(createManySink[0]).toMatchObject({
        endpoint: '/api/properties',
        method: 'GET',
        statusCode: 200,
        responseTime: 50,
        userId: 'user-1',
      });
      expect(createManySink[1]).toMatchObject({
        endpoint: '/api/auth/login',
        method: 'POST',
        statusCode: 401,
        responseTime: 120,
        userId: null,
      });
    });

    it('is a no-op when the buffer is empty', async () => {
      await service.flush();
      expect(prisma.requestLog.createMany).not.toHaveBeenCalled();
    });

    it('re-prepends records on DB failure for retry', async () => {
      prisma.requestLog.createMany.mockRejectedValueOnce(new Error('DB error'));

      service.record({
        endpoint: '/api/test',
        method: 'GET',
        statusCode: 200,
        responseTime: 10,
        userId: null,
      });

      await service.flush();

      // The buffer should have the record back for retry
      expect((service as any).buffer).toHaveLength(1);

      // Reset mock to default and flush again
      prisma.requestLog.createMany.mockReset();
      prisma.requestLog.createMany.mockImplementation((args: any) => {
        createManySink.push(...args.data);
        return Promise.resolve({ count: args.data.length });
      });
      await service.flush();

      // Record was persisted on retry
      expect(createManySink).toHaveLength(1);
      expect(createManySink[0].endpoint).toBe('/api/test');
    });
  });

  // ── Restart persistence (the core fix) ──────────────────────────────────

  describe('restart persistence', () => {
    it('getStats reads from the database, not from memory', async () => {
      const now = new Date();
      prisma.requestLog.findMany.mockResolvedValue([
        {
          endpoint: '/api/properties',
          method: 'GET',
          statusCode: 200,
          responseTime: 100,
          userId: 'user-1',
          timestamp: now,
        },
        {
          endpoint: '/api/properties',
          method: 'GET',
          statusCode: 500,
          responseTime: 500,
          userId: 'user-2',
          timestamp: now,
        },
      ]);

      const stats = await service.getStats(60);

      expect(prisma.requestLog.findMany).toHaveBeenCalled();
      expect(stats.totalRequests).toBe(2);
      expect(stats.totalErrors).toBe(1);
      expect(stats.overallErrorRate).toBe(50);
    });

    it('returns empty stats when the database has no records', async () => {
      const stats = await service.getStats(60);

      expect(stats.totalRequests).toBe(0);
      expect(stats.topEndpoints).toEqual([]);
    });
  });

  // ── Read methods ────────────────────────────────────────────────────────

  describe('getEndpointStats()', () => {
    it('returns endpoint breakdown from database records', async () => {
      prisma.requestLog.findMany.mockResolvedValue([
        {
          endpoint: '/api/properties',
          method: 'GET',
          statusCode: 200,
          responseTime: 100,
          userId: 'u1',
          timestamp: new Date(),
        },
        {
          endpoint: '/api/properties',
          method: 'GET',
          statusCode: 200,
          responseTime: 200,
          userId: 'u1',
          timestamp: new Date(),
        },
        {
          endpoint: '/api/auth/login',
          method: 'POST',
          statusCode: 401,
          responseTime: 50,
          userId: null,
          timestamp: new Date(),
        },
      ]);

      const endpoints = await service.getEndpointStats(60);

      expect(endpoints).toHaveLength(2);
      // Top by request count
      expect(endpoints[0].endpoint).toBe('GET /api/properties');
      expect(endpoints[0].requestCount).toBe(2);
      expect(endpoints[1].endpoint).toBe('POST /api/auth/login');
      expect(endpoints[1].requestCount).toBe(1);
      expect(endpoints[1].errorCount).toBe(1);
    });
  });

  describe('getUserStats()', () => {
    it('returns usage stats for a specific user', async () => {
      const now = new Date();
      prisma.requestLog.findMany.mockResolvedValue([
        {
          endpoint: '/api/properties',
          method: 'GET',
          statusCode: 200,
          responseTime: 100,
          userId: 'user-1',
          timestamp: now,
        },
        {
          endpoint: '/api/properties',
          method: 'GET',
          statusCode: 500,
          responseTime: 500,
          userId: 'user-1',
          timestamp: now,
        },
        {
          endpoint: '/api/other',
          method: 'GET',
          statusCode: 200,
          responseTime: 50,
          userId: 'user-2',
          timestamp: now,
        },
      ]);

      const stats = await service.getUserStats('user-1', 60);

      expect(stats).not.toBeNull();
      expect(stats?.userId).toBe('user-1');
      expect(stats?.requestCount).toBe(2);
      expect(stats?.errorCount).toBe(1);
      expect(stats?.avgResponseTime).toBe(300);
    });

    it('returns null when no records exist for the user', async () => {
      prisma.requestLog.findMany.mockResolvedValue([]);

      const stats = await service.getUserStats('nonexistent', 60);
      expect(stats).toBeNull();
    });
  });

  // ── reset() ─────────────────────────────────────────────────────────────

  describe('reset()', () => {
    it('clears the buffer and deletes all database records', async () => {
      service.record({
        endpoint: '/api/test',
        method: 'GET',
        statusCode: 200,
        responseTime: 10,
        userId: null,
      });

      await service.reset();

      expect(prisma.requestLog.deleteMany).toHaveBeenCalled();
    });
  });

  // ── Retention cleanup ───────────────────────────────────────────────────

  describe('pruneExpiredRecords()', () => {
    it('deletes records older than the retention period', async () => {
      prisma.requestLog.deleteMany.mockResolvedValue({
        count: 42,
      });

      await service.pruneExpiredRecords();

      expect(prisma.requestLog.deleteMany).toHaveBeenCalledWith({
        where: {
          timestamp: { lt: expect.any(Date) },
        },
      });
    });

    it('logs when records are pruned', async () => {
      const logSpy = jest.fn();
      // Replace logger.log for the duration of this test
      (service as any).logger = { log: logSpy, error: jest.fn() };

      prisma.requestLog.deleteMany.mockResolvedValue({
        count: 10,
      });

      await service.pruneExpiredRecords();

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Pruned 10 expired request log records'),
      );
    });
  });

  // ── onModuleDestroy ─────────────────────────────────────────────────────

  describe('onModuleDestroy()', () => {
    it('flushes remaining buffer and stops the timer', async () => {
      service.record({
        endpoint: '/api/test',
        method: 'GET',
        statusCode: 200,
        responseTime: 10,
        userId: null,
      });

      await service.onModuleDestroy();

      expect(prisma.requestLog.createMany).toHaveBeenCalled();
      expect(clearInterval).toHaveBeenCalled();
    });

    it('prevents further records from being flushed after destroy', async () => {
      await service.onModuleDestroy();

      // Trying to flush after destroy should be handled gracefully
      service.record({
        endpoint: '/api/test',
        method: 'GET',
        statusCode: 200,
        responseTime: 10,
        userId: null,
      });

      // No crash expected; flushTimer is null so the periodic timer won't run
    });
  });

  // ── Aggregation correctness ─────────────────────────────────────────────

  describe('getStats() aggregation', () => {
    it('computes slow endpoints correctly', async () => {
      const now = new Date();
      prisma.requestLog.findMany.mockResolvedValue([
        {
          endpoint: '/api/slow',
          method: 'GET',
          statusCode: 200,
          responseTime: 2000, // > 1000ms threshold
          userId: null,
          timestamp: now,
        },
        {
          endpoint: '/api/fast',
          method: 'GET',
          statusCode: 200,
          responseTime: 50,
          userId: null,
          timestamp: now,
        },
      ]);

      const stats = await service.getStats(60);

      expect(stats.slowEndpoints).toHaveLength(1);
      expect(stats.slowEndpoints[0].endpoint).toBe('GET /api/slow');
      expect(stats.slowEndpoints[0].avgResponseTime).toBe(2000);
    });

    it('computes errorsByStatus correctly', async () => {
      const now = new Date();
      prisma.requestLog.findMany.mockResolvedValue([
        {
          endpoint: '/a',
          method: 'GET',
          statusCode: 400,
          responseTime: 10,
          userId: null,
          timestamp: now,
        },
        {
          endpoint: '/b',
          method: 'GET',
          statusCode: 400,
          responseTime: 10,
          userId: null,
          timestamp: now,
        },
        {
          endpoint: '/c',
          method: 'GET',
          statusCode: 500,
          responseTime: 10,
          userId: null,
          timestamp: now,
        },
        {
          endpoint: '/d',
          method: 'GET',
          statusCode: 200,
          responseTime: 10,
          userId: null,
          timestamp: now,
        },
      ]);

      const stats = await service.getStats(60);

      expect(stats.errorsByStatus).toHaveLength(2);
      expect(stats.errorsByStatus[0]).toMatchObject({
        statusCode: 400,
        count: 2,
        rate: 50,
      });
      expect(stats.errorsByStatus[1]).toMatchObject({
        statusCode: 500,
        count: 1,
        rate: 25,
      });
    });

    it('computes p95 and p99 response times', async () => {
      const now = new Date();
      // Create 100 records with response times 1..100
      const records = Array.from({ length: 100 }, (_, i) => ({
        endpoint: '/api/test',
        method: 'GET',
        statusCode: 200,
        responseTime: i + 1,
        userId: null,
        timestamp: now,
      }));

      prisma.requestLog.findMany.mockResolvedValue(records);

      const stats = await service.getStats(60);

      expect(stats.topEndpoints[0].p95ResponseTime).toBe(95);
      expect(stats.topEndpoints[0].p99ResponseTime).toBe(99);
    });
  });
});
