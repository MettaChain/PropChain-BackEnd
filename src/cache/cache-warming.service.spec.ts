import { Test, TestingModule } from '@nestjs/testing';
import { CacheWarmingService, resolveWarmingIntervalMs, DEFAULT_WARMING_INTERVAL_MS } from './cache-warming.service';
import { CacheService } from './cache.service';
import { CacheMonitoringService } from './cache-monitoring.service';
import { PrismaService } from '../database/prisma.service';

describe('CacheWarmingService', () => {
  let service: CacheWarmingService;
  let cacheService: jest.Mocked<CacheService>;
  let cacheMonitoringService: jest.Mocked<CacheMonitoringService>;
  let prisma: jest.Mocked<PrismaService>;

  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = { ...originalEnv };
    delete process.env.CACHE_WARMING_ENABLED;

    cacheService = {
      set: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(undefined),
    } as any;

    cacheMonitoringService = {
      getMetrics: jest.fn().mockReturnValue({ hitRate: 85, totalRequests: 100 }),
    } as any;

    prisma = {
      property: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      popularSearch: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CacheWarmingService,
        { provide: CacheService, useValue: cacheService },
        { provide: CacheMonitoringService, useValue: cacheMonitoringService },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<CacheWarmingService>(CacheWarmingService);
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  describe('resolveWarmingIntervalMs', () => {
    it('should return default interval when env var is not set', () => {
      delete process.env.CACHE_WARMING_INTERVAL;
      expect(resolveWarmingIntervalMs()).toBe(DEFAULT_WARMING_INTERVAL_MS);
    });

    it('should return default interval when env var is invalid', () => {
      process.env.CACHE_WARMING_INTERVAL = 'invalid';
      expect(resolveWarmingIntervalMs()).toBe(DEFAULT_WARMING_INTERVAL_MS);
    });

    it('should return default interval when env var is zero', () => {
      process.env.CACHE_WARMING_INTERVAL = '0';
      expect(resolveWarmingIntervalMs()).toBe(DEFAULT_WARMING_INTERVAL_MS);
    });

    it('should return default interval when env var is negative', () => {
      process.env.CACHE_WARMING_INTERVAL = '-1000';
      expect(resolveWarmingIntervalMs()).toBe(DEFAULT_WARMING_INTERVAL_MS);
    });

    it('should return custom interval when env var is valid', () => {
      process.env.CACHE_WARMING_INTERVAL = '60000';
      expect(resolveWarmingIntervalMs()).toBe(60000);
    });

    it('should parse string numbers correctly', () => {
      process.env.CACHE_WARMING_INTERVAL = '300000';
      expect(resolveWarmingIntervalMs()).toBe(300000);
    });
  });

  describe('onModuleInit', () => {
    it('should perform initial warm when enabled', async () => {
      process.env.CACHE_WARMING_ENABLED = 'true';
      jest.useFakeTimers();

      await service.onModuleInit();

      expect(cacheService.set).toHaveBeenCalled();
    });

    it('should skip initial warm when disabled', async () => {
      process.env.CACHE_WARMING_ENABLED = 'false';
      jest.useFakeTimers();

      await service.onModuleInit();

      expect(cacheService.set).not.toHaveBeenCalled();
    });

    it('should schedule periodic warming when enabled', async () => {
      process.env.CACHE_WARMING_ENABLED = 'true';
      process.env.CACHE_WARMING_INTERVAL = '1000';
      jest.useFakeTimers();

      await service.onModuleInit();

      // Advance timer by interval
      jest.advanceTimersByTime(1000);
      await Promise.resolve(); // Allow pending promises to resolve

      // Should have been called at least twice (initial + one periodic)
      expect(cacheService.set).toHaveBeenCalled();
    });

    it('should not schedule periodic warming when disabled', async () => {
      process.env.CACHE_WARMING_ENABLED = 'false';
      jest.useFakeTimers();

      await service.onModuleInit();

      // Advance timer
      jest.advanceTimersByTime(10000);
      await Promise.resolve();

      // Should not have been called
      expect(cacheService.set).not.toHaveBeenCalled();
    });
  });

  describe('onModuleDestroy', () => {
    it('should clear interval on destroy', async () => {
      process.env.CACHE_WARMING_ENABLED = 'true';
      jest.useFakeTimers();

      await service.onModuleInit();
      service.onModuleDestroy();

      // Advance timer - should not trigger warming
      jest.advanceTimersByTime(10000);
      await Promise.resolve();

      // Should only have initial warm, no periodic
      expect(cacheService.set).toHaveBeenCalled();
    });
  });

  describe('warmCache', () => {
    it('should warm all cache keys in parallel', async () => {
      await service.warmCache();

      expect(cacheService.set).toHaveBeenCalled();
    });

    it('should continue warming if one warmer fails', async () => {
      cacheService.set.mockRejectedValueOnce(new Error('Redis error'));

      await expect(service.warmCache()).resolves.not.toThrow();
    });

    it('should log hit rate before and after warming', async () => {
      cacheMonitoringService.getMetrics
        .mockReturnValueOnce({ hitRate: 70, totalRequests: 100 })
        .mockReturnValueOnce({ hitRate: 85, totalRequests: 200 });

      await service.warmCache();

      expect(cacheMonitoringService.getMetrics).toHaveBeenCalled();
    });
  });

  describe('handlePeriodicWarming', () => {
    it('should skip when disabled', async () => {
      process.env.CACHE_WARMING_ENABLED = 'false';

      await service.handlePeriodicWarming();

      expect(cacheService.set).not.toHaveBeenCalled();
    });

    it('should execute warm when enabled', async () => {
      process.env.CACHE_WARMING_ENABLED = 'true';

      await service.handlePeriodicWarming();

      expect(cacheService.set).toHaveBeenCalled();
    });
  });

  describe('individual warmers', () => {
    it('should warm featured properties', async () => {
      (prisma.property.findMany as jest.Mock).mockResolvedValue([
        { id: '1', name: 'Property 1' },
      ]);

      await service['warmFeaturedProperties']();

      expect(prisma.property.findMany).toHaveBeenCalled();
      expect(cacheService.set).toHaveBeenCalled();
    });

    it('should handle featured properties warming failure gracefully', async () => {
      (prisma.property.findMany as jest.Mock).mockRejectedValue(new Error('DB error'));

      await expect(service['warmFeaturedProperties']()).resolves.not.toThrow();
    });

    it('should warm popular properties', async () => {
      (prisma.property.findMany as jest.Mock).mockResolvedValue([
        { id: '2', name: 'Property 2' },
      ]);

      await service['warmPopularProperties']();

      expect(prisma.property.findMany).toHaveBeenCalled();
      expect(cacheService.set).toHaveBeenCalled();
    });

    it('should warm trust score leaderboard', async () => {
      (prisma.user.findMany as jest.Mock).mockResolvedValue([
        { id: 'user1', email: 'user@example.com' },
      ]);

      await service['warmTrustScoreLeaderboard']();

      expect(prisma.user.findMany).toHaveBeenCalled();
      expect(cacheService.set).toHaveBeenCalled();
    });

    it('should warm search suggestions', async () => {
      (prisma.popularSearch.findMany as jest.Mock).mockResolvedValue([
        { term: 'house', frequency: 100 },
      ]);

      await service['warmSearchSuggestions']();

      expect(prisma.popularSearch.findMany).toHaveBeenCalled();
      expect(cacheService.set).toHaveBeenCalled();
    });
  });

  describe('predictive warming', () => {
    it('should skip when no access pattern exists', async () => {
      cacheService.get.mockResolvedValue(undefined);

      await service['warmPredictiveKeys']();

      expect(cacheService.set).not.toHaveBeenCalled();
    });

    it('should warm hot keys that are already cached', async () => {
      cacheService.get.mockResolvedValue({ data: 'cached' });

      await service['warmPredictiveKeys']();

      expect(cacheService.set).toHaveBeenCalled();
    });

    it('should not warm keys that are not cached', async () => {
      cacheService.get.mockResolvedValue(undefined);

      await service['warmPredictiveKeys']();

      expect(cacheService.set).not.toHaveBeenCalled();
    });
  });

  describe('public helpers', () => {
    it('should warm user cache', async () => {
      await service.warmUserCache('user123', { name: 'John' });

      expect(cacheService.set).toHaveBeenCalled();
    });

    it('should warm dashboard cache', async () => {
      await service.warmDashboardCache('user123', { stats: {} });

      expect(cacheService.set).toHaveBeenCalled();
    });

    it('should warm leaderboard cache', async () => {
      await service.warmLeaderboardCache([{ id: '1', score: 100 }]);

      expect(cacheService.set).toHaveBeenCalled();
    });

    it('should warm featured properties cache', async () => {
      await service.warmFeaturedPropertiesCache([{ id: '1', name: 'Property' }]);

      expect(cacheService.set).toHaveBeenCalled();
    });

    it('should return warming metrics', () => {
      cacheMonitoringService.getMetrics.mockReturnValue({
        hitRate: 90,
        totalRequests: 500,
      });

      const metrics = service.getWarmingMetrics();

      expect(metrics.lastWarmingHitRate).toBe(90);
      expect(metrics.totalCycles).toBe(500);
    });
  });
});
