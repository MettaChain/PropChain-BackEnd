import { DashboardMetricsService } from './dashboard-metrics.service';
import { PrismaService } from '../database/prisma.service';
import { CacheService } from '../cache/cache.service';
import { QueueMonitoringService } from '../admin/queue/queue.service';

describe('DashboardMetricsService (#1297)', () => {
  let service: DashboardMetricsService;

  const prisma = {
    fraudAlert: { count: jest.fn() },
    property: { count: jest.fn() },
    transaction: { count: jest.fn() },
  };

  const fraudCount = ({ where }: any) => {
    if (where.status === 'OPEN' && where.severity) return Promise.resolve(3);
    if (where.status === 'OPEN') return Promise.resolve(5);
    return Promise.resolve(2);
  };

  const propertyCount = ({ where }: any) => {
    if (where.createdAt) return Promise.resolve(7);
    if (where.status) return Promise.resolve(80);
    return Promise.resolve(100);
  };

  const transactionCount = (args: any) => {
    const where = args?.where;
    if (where?.createdAt) return Promise.resolve(3);
    if (where?.status === 'PENDING') return Promise.resolve(6);
    if (where?.status === 'COMPLETED') return Promise.resolve(40);
    return Promise.resolve(50);
  };

  const cacheService = {
    getOrSet: jest.fn(async (_key: string, factory: () => Promise<unknown>) => factory()),
  };

  const queueMonitoring = {
    getQueueMetrics: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    cacheService.getOrSet.mockImplementation(
      async (_key: string, factory: () => Promise<unknown>) => factory(),
    );
    queueMonitoring.getQueueMetrics.mockResolvedValue({
      metrics: [
        { queue: 'mail', depth: 4, waiting: 2, active: 1, failed: 1 },
        { queue: 'export', depth: 6, waiting: 6, active: 0, failed: 0 },
      ],
    });
    prisma.fraudAlert.count.mockImplementation(fraudCount as any);
    prisma.property.count.mockImplementation(propertyCount as any);
    prisma.transaction.count.mockImplementation(transactionCount as any);

    service = new DashboardMetricsService(
      prisma as unknown as PrismaService,
      cacheService as unknown as CacheService,
      queueMonitoring as unknown as QueueMonitoringService,
    );
  });

  it('aggregates queue, fraud, property and transaction metrics', async () => {
    const snapshot = await service.buildSnapshot();

    expect(snapshot.generatedAt).toEqual(expect.any(String));
    expect(snapshot.queue).toEqual({
      totalDepth: 10,
      queues: [
        { queue: 'mail', depth: 4, waiting: 2, active: 1, failed: 1 },
        { queue: 'export', depth: 6, waiting: 6, active: 0, failed: 0 },
      ],
    });
    expect(snapshot.fraud).toEqual({ open: 5, investigating: 2, highSeverityOpen: 3 });
    expect(snapshot.properties).toEqual({ total: 100, active: 80, createdLast24h: 7 });
    expect(snapshot.transactions).toEqual({
      total: 50,
      pending: 6,
      completed: 40,
      createdLast24h: 3,
    });
  });

  it('caches the snapshot through the cache service', async () => {
    await service.getSnapshot();

    expect(cacheService.getOrSet).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Function),
      expect.any(Number),
    );
  });

  it('degrades gracefully when the queue source fails', async () => {
    queueMonitoring.getQueueMetrics.mockRejectedValue(new Error('redis down'));

    const snapshot = await service.buildSnapshot();
    expect(snapshot.queue).toBeNull();
    expect(snapshot.properties).not.toBeNull();
  });

  it('degrades gracefully when the database source fails', async () => {
    prisma.property.count.mockRejectedValue(new Error('db down'));

    const snapshot = await service.buildSnapshot();
    expect(snapshot.properties).toBeNull();
    expect(snapshot.fraud).not.toBeNull();
  });

  it('computes directly if the cache itself throws', async () => {
    cacheService.getOrSet.mockRejectedValue(new Error('cache down'));

    const snapshot = await service.getSnapshot();
    expect(snapshot.properties).toEqual({ total: 100, active: 80, createdLast24h: 7 });
  });
});
