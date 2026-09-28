import { AnalyticsService } from './analytics.service';
import { PrismaService } from '../database/prisma.service';

const mockRpush = jest.fn().mockResolvedValue(1);
const mockLrange = jest.fn().mockResolvedValue([]);
const mockLtrim = jest.fn().mockResolvedValue('OK');
const mockConnect = jest.fn().mockResolvedValue(undefined);
const mockQuit = jest.fn().mockResolvedValue(undefined);

const mockRedisInstance = {
  rpush: mockRpush,
  lrange: mockLrange,
  ltrim: mockLtrim,
  connect: mockConnect,
  quit: mockQuit,
  disconnect: jest.fn(),
};

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => mockRedisInstance),
}));

jest.mock('../cache/cache.config', () => ({
  getRedisConfig: jest.fn().mockReturnValue({
    host: 'localhost',
    port: 6379,
    password: undefined,
    db: 0,
    retryStrategy: () => 100,
  }),
}));

describe('AnalyticsService – Redis write coalescing (#1296)', () => {
  let service: AnalyticsService;
  let prisma: { requestLog: { createMany: jest.Mock } };
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, ANALYTICS_USE_REDIS_BUFFER: 'true' };

    prisma = {
      requestLog: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    const mockTimer = { unref: jest.fn() } as any;
    jest.spyOn(global, 'setInterval').mockReturnValue(mockTimer);
    jest.spyOn(global, 'clearInterval').mockImplementation(() => {});

    service = new AnalyticsService(prisma as unknown as PrismaService);
  });

  afterEach(async () => {
    await service.onModuleDestroy();
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('coalesces records into the Redis list instead of writing per request', () => {
    service.record({
      endpoint: '/api/properties',
      method: 'GET',
      statusCode: 200,
      responseTime: 12,
      userId: null,
    });

    expect(mockRpush).toHaveBeenCalledWith(
      'analytics:requestlogs:buffer',
      expect.stringContaining('/api/properties'),
    );
    expect(prisma.requestLog.createMany).not.toHaveBeenCalled();
  });

  it('drains the Redis list on flush and persists the records', async () => {
    mockLrange.mockResolvedValueOnce([
      JSON.stringify({
        endpoint: '/api/a',
        method: 'GET',
        statusCode: 200,
        responseTime: 5,
        userId: null,
        timestamp: new Date().toISOString(),
      }),
    ]);

    await service.flush();

    expect(mockLrange).toHaveBeenCalledWith('analytics:requestlogs:buffer', 0, -1);
    expect(mockLtrim).toHaveBeenCalledWith('analytics:requestlogs:buffer', 1, -1);
    expect(prisma.requestLog.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.requestLog.createMany.mock.calls[0][0].data).toHaveLength(1);
  });

  it('is a no-op when neither the Redis list nor memory buffer has records', async () => {
    mockLrange.mockResolvedValueOnce([]);
    await service.flush();
    expect(prisma.requestLog.createMany).not.toHaveBeenCalled();
  });

  it('falls back to the in-memory buffer when the Redis push fails', async () => {
    mockRpush.mockRejectedValueOnce(new Error('redis down'));

    service.record({
      endpoint: '/api/fallback',
      method: 'GET',
      statusCode: 200,
      responseTime: 7,
      userId: null,
    });

    // Allow the rejected promise to be handled
    await Promise.resolve();
    await Promise.resolve();

    expect((service as any).buffer.length).toBeGreaterThanOrEqual(1);
  });
});
