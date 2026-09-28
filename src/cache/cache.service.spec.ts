/**
 * Cache Service Tests
 * Tests error handling, typed results, and integration with monitoring service
 */

import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { CacheService } from './cache.service';
import { CacheMonitoringService } from './cache-monitoring.service';
import { Cache } from 'cache-manager';
import {
  CacheOperationStatus,
  createSuccessResult,
  createMissResult,
  createErrorResult,
  createOperationSuccessResult,
  createOperationErrorResult,
} from './cache.types';

describe('CacheService', () => {
  let service: CacheService;
  let cacheManager: jest.Mocked<Cache>;
  let monitoringService: jest.Mocked<CacheMonitoringService>;

  beforeEach(async () => {
    const mockCacheManager = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      store: {
        reset: jest.fn(),
        clear: jest.fn(),
        getClient: jest.fn(),
      },
    } as unknown as jest.Mocked<Cache>;

    const mockMonitoringService = {
      recordHit: jest.fn(),
      recordMiss: jest.fn(),
      recordError: jest.fn(),
      recordResponseTime: jest.fn(),
      getMetrics: jest.fn(),
      resetMetrics: jest.fn(),
      getAlerts: jest.fn(),
      logSummary: jest.fn(),
    } as unknown as jest.Mocked<CacheMonitoringService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CacheService,
        {
          provide: CACHE_MANAGER,
          useValue: mockCacheManager,
        },
        {
          provide: CacheMonitoringService,
          useValue: mockMonitoringService,
        },
      ],
    }).compile();

    service = module.get<CacheService>(CacheService);
    cacheManager = module.get(CACHE_MANAGER);
    monitoringService = module.get(CacheMonitoringService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('get', () => {
    it('should return success result when cache hit', async () => {
      const testData = { id: 1, name: 'test' };
      cacheManager.get.mockResolvedValue(testData);

      const result = await service.get('test-key');

      expect(result.status).toBe(CacheOperationStatus.SUCCESS);
      expect(result.data).toEqual(testData);
      expect(monitoringService.recordHit).toHaveBeenCalled();
      expect(monitoringService.recordMiss).not.toHaveBeenCalled();
      expect(monitoringService.recordError).not.toHaveBeenCalled();
    });

    it('should return miss result when cache miss', async () => {
      cacheManager.get.mockResolvedValue(undefined);

      const result = await service.get('test-key');

      expect(result.status).toBe(CacheOperationStatus.MISS);
      expect(result.data).toBeUndefined();
      expect(monitoringService.recordMiss).toHaveBeenCalled();
      expect(monitoringService.recordHit).not.toHaveBeenCalled();
      expect(monitoringService.recordError).not.toHaveBeenCalled();
    });

    it('should return error result when cache operation fails', async () => {
      const error = new Error('Redis connection failed');
      cacheManager.get.mockRejectedValue(error);

      const result = await service.get('test-key');

      expect(result.status).toBe(CacheOperationStatus.ERROR);
      expect(result.error).toBe('Redis connection failed');
      expect(monitoringService.recordError).toHaveBeenCalled();
      expect(monitoringService.recordHit).not.toHaveBeenCalled();
      expect(monitoringService.recordMiss).not.toHaveBeenCalled();
    });

    it('should handle unknown error types', async () => {
      cacheManager.get.mockRejectedValue('Unknown error string');

      const result = await service.get('test-key');

      expect(result.status).toBe(CacheOperationStatus.ERROR);
      expect(result.error).toBe('Unknown error');
      expect(monitoringService.recordError).toHaveBeenCalled();
    });
  });

  describe('set', () => {
    it('should return success result when set succeeds', async () => {
      cacheManager.set.mockResolvedValue(undefined);

      const result = await service.set('test-key', { data: 'value' }, 60);

      expect(result.status).toBe(CacheOperationStatus.SUCCESS);
      expect(result.error).toBeUndefined();
      expect(cacheManager.set).toHaveBeenCalledWith('test-key', { data: 'value' }, 60000);
      expect(monitoringService.recordError).not.toHaveBeenCalled();
    });

    it('should tag key when tag is provided', async () => {
      cacheManager.set.mockResolvedValue(undefined);

      const result = await service.set('test-key', { data: 'value' }, 60, 'test-tag');

      expect(result.status).toBe(CacheOperationStatus.SUCCESS);
      expect(cacheManager.set).toHaveBeenCalledWith('test-key', { data: 'value' }, 60000);
    });

    it('should return error result when set fails', async () => {
      const error = new Error('Redis write failed');
      cacheManager.set.mockRejectedValue(error);

      const result = await service.set('test-key', { data: 'value' }, 60);

      expect(result.status).toBe(CacheOperationStatus.ERROR);
      expect(result.error).toBe('Redis write failed');
      expect(monitoringService.recordError).toHaveBeenCalled();
    });
  });

  describe('del', () => {
    it('should return success result when delete succeeds', async () => {
      cacheManager.del.mockResolvedValue(undefined);

      const result = await service.del('test-key');

      expect(result.status).toBe(CacheOperationStatus.SUCCESS);
      expect(result.error).toBeUndefined();
      expect(cacheManager.del).toHaveBeenCalledWith('test-key');
      expect(monitoringService.recordError).not.toHaveBeenCalled();
    });

    it('should return error result when delete fails', async () => {
      const error = new Error('Redis delete failed');
      cacheManager.del.mockRejectedValue(error);

      const result = await service.del('test-key');

      expect(result.status).toBe(CacheOperationStatus.ERROR);
      expect(result.error).toBe('Redis delete failed');
      expect(monitoringService.recordError).toHaveBeenCalled();
    });
  });

  describe('delMultiple', () => {
    it('should return success result when multiple deletes succeed', async () => {
      cacheManager.del.mockResolvedValue(undefined);

      const result = await service.delMultiple(['key1', 'key2', 'key3']);

      expect(result.status).toBe(CacheOperationStatus.SUCCESS);
      expect(result.error).toBeUndefined();
      expect(cacheManager.del).toHaveBeenCalledTimes(3);
      expect(monitoringService.recordError).not.toHaveBeenCalled();
    });

    it('should return error result when multiple deletes fail', async () => {
      const error = new Error('Redis batch delete failed');
      cacheManager.del.mockRejectedValue(error);

      const result = await service.delMultiple(['key1', 'key2']);

      expect(result.status).toBe(CacheOperationStatus.ERROR);
      expect(result.error).toBe('Redis batch delete failed');
      expect(monitoringService.recordError).toHaveBeenCalled();
    });
  });

  describe('clear', () => {
    it('should return success result when clear succeeds with reset', async () => {
      const mockStore = { reset: jest.fn().mockResolvedValue(undefined) };
      (cacheManager as any).store = mockStore;

      const result = await service.clear();

      expect(result.status).toBe(CacheOperationStatus.SUCCESS);
      expect(result.error).toBeUndefined();
      expect(mockStore.reset).toHaveBeenCalled();
      expect(monitoringService.recordError).not.toHaveBeenCalled();
    });

    it('should return success result when clear succeeds with clear', async () => {
      const mockStore = { clear: jest.fn().mockResolvedValue(undefined) };
      (cacheManager as any).store = mockStore;

      const result = await service.clear();

      expect(result.status).toBe(CacheOperationStatus.SUCCESS);
      expect(result.error).toBeUndefined();
      expect(mockStore.clear).toHaveBeenCalled();
      expect(monitoringService.recordError).not.toHaveBeenCalled();
    });

    it('should return error result when clear fails', async () => {
      const error = new Error('Redis clear failed');
      const mockStore = { reset: jest.fn().mockRejectedValue(error) };
      (cacheManager as any).store = mockStore;

      const result = await service.clear();

      expect(result.status).toBe(CacheOperationStatus.ERROR);
      expect(result.error).toBe('Redis clear failed');
      expect(monitoringService.recordError).toHaveBeenCalled();
    });
  });

  describe('getOrSet', () => {
    it('should return cached data on cache hit', async () => {
      const cachedData = { id: 1, name: 'cached' };
      cacheManager.get.mockResolvedValue(cachedData);

      const factory = jest.fn().mockResolvedValue({ id: 1, name: 'fresh' });
      const result = await service.getOrSet('test-key', factory, 60);

      expect(result.data).toEqual(cachedData);
      expect(result.source).toBe('cache');
      expect(result.error).toBeUndefined();
      expect(factory).not.toHaveBeenCalled();
      expect(monitoringService.recordError).not.toHaveBeenCalled();
    });

    it('should fetch and cache data on cache miss', async () => {
      cacheManager.get.mockResolvedValue(undefined);
      cacheManager.set.mockResolvedValue(undefined);

      const factory = jest.fn().mockResolvedValue({ id: 1, name: 'fresh' });
      const result = await service.getOrSet('test-key', factory, 60);

      expect(result.data).toEqual({ id: 1, name: 'fresh' });
      expect(result.source).toBe('factory');
      expect(result.error).toBeUndefined();
      expect(factory).toHaveBeenCalled();
      expect(cacheManager.set).toHaveBeenCalled();
      expect(monitoringService.recordError).not.toHaveBeenCalled();
    });

    it('should return factory data with error when cache set fails', async () => {
      cacheManager.get.mockResolvedValue(undefined);
      cacheManager.set.mockRejectedValue(new Error('Set failed'));

      const factory = jest.fn().mockResolvedValue({ id: 1, name: 'fresh' });
      const result = await service.getOrSet('test-key', factory, 60);

      expect(result.data).toEqual({ id: 1, name: 'fresh' });
      expect(result.source).toBe('factory');
      expect(result.error).toBe('Set failed');
      expect(factory).toHaveBeenCalled();
      expect(monitoringService.recordError).toHaveBeenCalled();
    });

    it('should return factory data with error when cache get fails', async () => {
      cacheManager.get.mockRejectedValue(new Error('Get failed'));
      cacheManager.set.mockResolvedValue(undefined);

      const factory = jest.fn().mockResolvedValue({ id: 1, name: 'fresh' });
      const result = await service.getOrSet('test-key', factory, 60);

      expect(result.data).toEqual({ id: 1, name: 'fresh' });
      expect(result.source).toBe('factory');
      expect(result.error).toBe('Get failed');
      expect(factory).toHaveBeenCalled();
      expect(monitoringService.recordError).toHaveBeenCalled();
    });

    it('should throw error when factory fails', async () => {
      cacheManager.get.mockResolvedValue(undefined);
      const factory = jest.fn().mockRejectedValue(new Error('Factory failed'));

      await expect(service.getOrSet('test-key', factory, 60)).rejects.toThrow('Factory failed');
      expect(monitoringService.recordError).toHaveBeenCalled();
    });
  });

  describe('invalidateByTag', () => {
    it('should return success result when tag invalidation succeeds', async () => {
      cacheManager.del.mockResolvedValue(undefined);

      const result = await service.invalidateByTag('test-tag');

      expect(result.status).toBe(CacheOperationStatus.SUCCESS);
      expect(result.error).toBeUndefined();
      expect(monitoringService.recordError).not.toHaveBeenCalled();
    });

    it('should return error result when tag invalidation fails', async () => {
      const error = new Error('Tag invalidation failed');
      cacheManager.del.mockRejectedValue(error);

      const result = await service.invalidateByTag('test-tag');

      expect(result.status).toBe(CacheOperationStatus.ERROR);
      expect(result.error).toBe('Tag invalidation failed');
      expect(monitoringService.recordError).toHaveBeenCalled();
    });
  });

  describe('setNx', () => {
    it('should return success with acquired=true when lock acquired', async () => {
      const mockClient = { set: jest.fn().mockResolvedValue('OK') };
      (cacheManager as any).store.getClient.mockReturnValue(mockClient);

      const result = await service.setNx('lock-key', 'lock-value', 30);

      expect(result.status).toBe(CacheOperationStatus.SUCCESS);
      expect(result.acquired).toBe(true);
      expect(result.error).toBeUndefined();
      expect(mockClient.set).toHaveBeenCalledWith('lock-key', 'lock-value', 'EX', 30, 'NX');
      expect(monitoringService.recordError).not.toHaveBeenCalled();
    });

    it('should return success with acquired=false when lock not acquired', async () => {
      const mockClient = { set: jest.fn().mockResolvedValue(null) };
      (cacheManager as any).store.getClient.mockReturnValue(mockClient);

      const result = await service.setNx('lock-key', 'lock-value', 30);

      expect(result.status).toBe(CacheOperationStatus.SUCCESS);
      expect(result.acquired).toBe(false);
      expect(result.error).toBeUndefined();
      expect(monitoringService.recordError).not.toHaveBeenCalled();
    });

    it('should return error result when setNx fails', async () => {
      const error = new Error('Redis setNx failed');
      const mockClient = { set: jest.fn().mockRejectedValue(error) };
      (cacheManager as any).store.getClient.mockReturnValue(mockClient);

      const result = await service.setNx('lock-key', 'lock-value', 30);

      expect(result.status).toBe(CacheOperationStatus.ERROR);
      expect(result.acquired).toBe(false);
      expect(result.error).toBe('Redis setNx failed');
      expect(monitoringService.recordError).toHaveBeenCalled();
    });
  });

  describe('getHealthStatus', () => {
    it('should return connected status when Redis is healthy', async () => {
      cacheManager.get.mockResolvedValue(undefined);
      const mockStats = { redisInfo: { used_memory_human: '100MB', db0: 'keys=100' } };
      jest.spyOn(service, 'getStats').mockResolvedValue(mockStats);

      const result = await service.getHealthStatus();

      expect(result.connected).toBe(true);
      expect(result.latencyMs).toBeDefined();
      expect(result.memoryUsage).toBe('100MB');
      expect(result.keysCount).toBe(100);
      expect(result.error).toBeUndefined();
    });

    it('should return disconnected status when Redis is unreachable', async () => {
      cacheManager.get.mockRejectedValue(new Error('Connection failed'));

      const result = await service.getHealthStatus();

      expect(result.connected).toBe(false);
      expect(result.latencyMs).toBeDefined();
      expect(result.error).toBe('Connection failed');
    });
  });

  describe('legacy methods', () => {
    it('getLegacy should return data on success, undefined otherwise', async () => {
      cacheManager.get.mockResolvedValue({ data: 'test' });
      expect(await service.getLegacy('key')).toEqual({ data: 'test' });

      cacheManager.get.mockResolvedValue(undefined);
      expect(await service.getLegacy('key')).toBeUndefined();

      cacheManager.get.mockRejectedValue(new Error('Error'));
      expect(await service.getLegacy('key')).toBeUndefined();
    });

    it('setLegacy should resolve without error', async () => {
      cacheManager.set.mockResolvedValue(undefined);
      await expect(service.setLegacy('key', 'value')).resolves.toBeUndefined();
    });

    it('delLegacy should resolve without error', async () => {
      cacheManager.del.mockResolvedValue(undefined);
      await expect(service.delLegacy('key')).resolves.toBeUndefined();
    });
  });
});
