import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  MultiLevelCacheService,
  MultiLevelCacheOptions,
} from '../../src/common/cache/multi-level-cache.service';
import { RedisService } from '../../src/common/services/redis.service';

describe('MultiLevelCacheService', () => {
  let service: MultiLevelCacheService;
  let redisService: jest.Mocked<RedisService>;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    const mockRedisService = {
      get: jest.fn(),
      setex: jest.fn(),
      del: jest.fn(),
      keys: jest.fn(),
      sadd: jest.fn(),
      smembers: jest.fn(),
      flushdb: jest.fn(),
      ttl: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          CACHE_L1_MAX_SIZE: 100,
          CACHE_L1_TTL: 300,
          CACHE_L2_TTL: 3600,
        };
        return config[key] ?? defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MultiLevelCacheService,
        { provide: RedisService, useValue: mockRedisService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<MultiLevelCacheService>(MultiLevelCacheService);
    redisService = module.get(RedisService);
    configService = module.get(ConfigService);

    await service.onModuleInit();
  });

  afterEach(async () => {
    await service.onModuleDestroy();
    jest.clearAllMocks();
  });

  describe('get', () => {
    it('should return value from L1 cache if present and not expired', async () => {
      const key = 'test:key';
      const value = { data: 'test' };

      await service.set(key, value);

      const result = await service.get(key);

      expect(result).toEqual(value);
      expect(redisService.get).not.toHaveBeenCalled();
    });

    it('should fetch from L2 cache if not in L1', async () => {
      const key = 'test:key';
      const value = { data: 'test' };

      redisService.get.mockResolvedValue(
        JSON.stringify({
          value,
          tags: [],
          version: 1,
          timestamp: Date.now(),
        }),
      );

      const result = await service.get(key);

      expect(result).toEqual(value);
      expect(redisService.get).toHaveBeenCalledWith(key);
    });

    it('should return undefined if not in any cache level', async () => {
      const key = 'test:key';

      redisService.get.mockResolvedValue(null);

      const result = await service.get(key);

      expect(result).toBeUndefined();
    });

    it('should handle L2 cache errors gracefully', async () => {
      const key = 'test:key';

      redisService.get.mockRejectedValue(new Error('Redis error'));

      const result = await service.get(key);

      expect(result).toBeUndefined();
    });
  });

  describe('set', () => {
    it('should set value in both L1 and L2 cache', async () => {
      const key = 'test:key';
      const value = { data: 'test' };
      const options: MultiLevelCacheOptions = { l1Ttl: 100, l2Ttl: 200 };

      await service.set(key, value, options);

      const l1Result = await service.get(key);
      expect(l1Result).toEqual(value);

      expect(redisService.setex).toHaveBeenCalledWith(key, 200, expect.any(String));
    });

    it('should use default TTLs when not specified', async () => {
      const key = 'test:key';
      const value = { data: 'test' };

      await service.set(key, value);

      expect(redisService.setex).toHaveBeenCalledWith(key, 3600, expect.any(String));
    });

    it('should store tags for invalidation', async () => {
      const key = 'test:key';
      const value = { data: 'test' };
      const options: MultiLevelCacheOptions = { tags: ['tag1', 'tag2'] };

      await service.set(key, value, options);

      expect(redisService.sadd).toHaveBeenCalledWith('tag:tag1', key);
      expect(redisService.sadd).toHaveBeenCalledWith('tag:tag2', key);
    });
  });

  describe('del', () => {
    it('should delete from both L1 and L2 cache', async () => {
      const key = 'test:key';

      await service.set(key, { data: 'test' });

      await service.del(key);

      const l1Result = await service.get(key);
      expect(l1Result).toBeUndefined();

      expect(redisService.del).toHaveBeenCalledWith(key);
    });
  });

  describe('wrap', () => {
    it('should return cached value if present', async () => {
      const key = 'test:key';
      const value = { data: 'cached' };
      const factory = jest.fn().mockResolvedValue({ data: 'fresh' });

      await service.set(key, value);

      const result = await service.wrap(key, factory);

      expect(result).toEqual(value);
      expect(factory).not.toHaveBeenCalled();
    });

    it('should call factory and cache result if not present', async () => {
      const key = 'test:key';
      const value = { data: 'fresh' };
      const factory = jest.fn().mockResolvedValue(value);

      redisService.get.mockResolvedValue(null);

      const result = await service.wrap(key, factory);

      expect(result).toEqual(value);
      expect(factory).toHaveBeenCalled();
      expect(redisService.setex).toHaveBeenCalled();
    });
  });

  describe('invalidateByTag', () => {
    it('should invalidate all entries with a given tag', async () => {
      const tag = 'user';
      const keys = ['user:1', 'user:2'];

      redisService.smembers.mockResolvedValue(keys);

      const result = await service.invalidateByTag(tag);

      expect(result).toBe(2);
      expect(redisService.del).toHaveBeenCalledWith('user:1');
      expect(redisService.del).toHaveBeenCalledWith('user:2');
      expect(redisService.del).toHaveBeenCalledWith(`tag:${tag}`);
    });

    it('should return 0 if no keys found for tag', async () => {
      const tag = 'nonexistent';

      redisService.smembers.mockResolvedValue([]);

      const result = await service.invalidateByTag(tag);

      expect(result).toBe(0);
    });
  });

  describe('invalidateByPattern', () => {
    it('should invalidate entries matching pattern', async () => {
      const pattern = 'user:*';
      const keys = ['user:1', 'user:2', 'user:3'];

      redisService.keys.mockResolvedValue(keys);

      const result = await service.invalidateByPattern(pattern);

      expect(result).toBe(3);
      expect(redisService.keys).toHaveBeenCalledWith(pattern);
      expect(redisService.del).toHaveBeenCalledTimes(3);
    });

    it('should handle L1 cache entries matching pattern', async () => {
      const pattern = 'test:*';

      await service.set('test:1', { data: 1 });
      await service.set('test:2', { data: 2 });
      await service.set('other:1', { data: 3 });

      redisService.keys.mockResolvedValue([]);

      await service.invalidateByPattern(pattern);

      expect(await service.get('test:1')).toBeUndefined();
      expect(await service.get('test:2')).toBeUndefined();
      expect(await service.get('other:1')).toEqual({ data: 3 });
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', () => {
      const stats = service.getStats();

      expect(stats).toHaveProperty('l1Hits');
      expect(stats).toHaveProperty('l1Misses');
      expect(stats).toHaveProperty('l2Hits');
      expect(stats).toHaveProperty('l2Misses');
      expect(stats).toHaveProperty('l1HitRate');
      expect(stats).toHaveProperty('l2HitRate');
      expect(stats).toHaveProperty('overallHitRate');
    });

    it('should track hits and misses correctly', async () => {
      const key = 'test:key';

      service.resetStats();

      redisService.get.mockResolvedValue(null);
      await service.get(key);

      await service.set(key, { data: 'test' });

      await service.get(key);

      const stats = service.getStats();
      expect(stats.l1Hits).toBe(1);
      expect(stats.l1Misses).toBe(1);
    });
  });

  describe('resetStats', () => {
    it('should reset all statistics', async () => {
      await service.set('key1', 'value1');
      await service.get('key1');

      service.resetStats();

      const stats = service.getStats();
      expect(stats.l1Hits).toBe(0);
      expect(stats.l1Misses).toBe(0);
      expect(stats.l2Hits).toBe(0);
      expect(stats.l2Misses).toBe(0);
    });
  });

  describe('clear', () => {
    it('should clear both L1 and L2 cache', async () => {
      await service.set('key1', 'value1');
      await service.set('key2', 'value2');

      await service.clear();

      expect(service.getL1Keys()).toHaveLength(0);

      expect(redisService.flushdb).toHaveBeenCalled();
    });
  });

  describe('registerInvalidationPolicy', () => {
    it('should register custom invalidation policy', () => {
      const policy = {
        type: 'pattern' as const,
        value: 'custom:*',
        cascade: true,
      };

      expect(() => service.registerInvalidationPolicy('custom', policy)).not.toThrow();
    });
  });

  describe('incrementVersion', () => {
    it('should increment version for existing entry', async () => {
      const key = 'test:key';
      const value = { data: 'test' };

      await service.set(key, value, { version: 1 });

      redisService.get.mockResolvedValue(
        JSON.stringify({
          value,
          tags: [],
          version: 1,
          timestamp: Date.now(),
        }),
      );
      redisService.ttl.mockResolvedValue(3600);

      const newVersion = await service.incrementVersion(key);

      expect(newVersion).toBe(2);
    });

    it('should return 1 for non-existing entry', async () => {
      const key = 'nonexistent:key';

      redisService.get.mockResolvedValue(null);

      const version = await service.incrementVersion(key);

      expect(version).toBe(1);
    });
  });
});
