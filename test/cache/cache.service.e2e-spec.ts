import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { CacheService } from '../../src/cache/cache.service';
import { CACHE_TTL, CACHE_TAGS } from '../../src/cache/cache.config';

describe('CacheService e2e — core primitives (locks, TTL, tags)', () => {
  let app: INestApplication;
  let cacheService: CacheService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    cacheService = app.get(CacheService);
    await cacheService.clear(); // Clear any existing cache before tests
  }, 20000);

  afterAll(async () => {
    await cacheService.clear();
    await app.close();
  });

  beforeEach(async () => {
    await cacheService.clear(); // Clear cache before each test for isolation
  });

  describe('setNx (distributed lock primitive)', () => {
    it('acquires a lock successfully when key is not present', async () => {
      const lockKey = 'test:lock:1';
      const acquired = await cacheService.setNx(lockKey, 'locked', 10);
      expect(acquired).toBe(true);
    });

    it('fails to acquire an already held lock', async () => {
      const lockKey = 'test:lock:2';
      const firstAcquire = await cacheService.setNx(lockKey, 'locked', 10);
      expect(firstAcquire).toBe(true);

      const secondAcquire = await cacheService.setNx(lockKey, 'locked', 10);
      expect(secondAcquire).toBe(false);
    });

    it('re-acquires a lock after it expires (TTL works)', async () => {
      const lockKey = 'test:lock:expiry';
      const firstAcquire = await cacheService.setNx(lockKey, 'locked', 1); // 1 second TTL
      expect(firstAcquire).toBe(true);

      // Wait for lock to expire
      await new Promise(resolve => setTimeout(resolve, 1100));

      const secondAcquire = await cacheService.setNx(lockKey, 'locked', 1);
      expect(secondAcquire).toBe(true);
    });
  });

  describe('TTL behavior', () => {
    it('stores a value and retrieves it before TTL expires', async () => {
      const key = 'test:ttl:valid';
      const value = { data: 'test' };
      await cacheService.set(key, value, 5); // 5 second TTL

      const retrieved = await cacheService.get(key);
      expect(retrieved).toEqual(value);
    });

    it('returns undefined after TTL expires', async () => {
      const key = 'test:ttl:expired';
      const value = { data: 'test-expired' };
      await cacheService.set(key, value, 1); // 1 second TTL

      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 1100));

      const retrieved = await cacheService.get(key);
      expect(retrieved).toBeUndefined();
    });

    it('uses default TTL when not specified', async () => {
      const key = 'test:ttl:default';
      const value = { data: 'default-ttl' };
      await cacheService.set(key, value); // Use default CACHE_TTL.MEDIUM

      const retrieved = await cacheService.get(key);
      expect(retrieved).toEqual(value);
    });
  });

  describe('tag-based invalidation', () => {
    it('tags a single key and invalidates it correctly', async () => {
      const key = 'test:tag:single';
      const value = { data: 'tagged-single' };
      await cacheService.set(key, value, 60, CACHE_TAGS.PROPERTIES);

      // Verify the value exists before invalidation
      const beforeInvalidate = await cacheService.get(key);
      expect(beforeInvalidate).toEqual(value);

      // Invalidate by tag
      await cacheService.invalidateByTag(CACHE_TAGS.PROPERTIES);

      // Verify the value is gone
      const afterInvalidate = await cacheService.get(key);
      expect(afterInvalidate).toBeUndefined();
    });

    it('tags multiple keys with the same tag and invalidates all at once', async () => {
      const key1 = 'test:tag:multi1';
      const key2 = 'test:tag:multi2';
      const key3 = 'test:tag:untagged'; // Untagged key should remain
      const value1 = { data: 'tagged-1' };
      const value2 = { data: 'tagged-2' };
      const value3 = { data: 'untagged' };

      await cacheService.set(key1, value1, 60, CACHE_TAGS.TRUST_SCORE);
      await cacheService.set(key2, value2, 60, CACHE_TAGS.TRUST_SCORE);
      await cacheService.set(key3, value3, 60); // No tag

      // Verify all exist before invalidation
      expect(await cacheService.get(key1)).toEqual(value1);
      expect(await cacheService.get(key2)).toEqual(value2);
      expect(await cacheService.get(key3)).toEqual(value3);

      // Invalidate by tag
      await cacheService.invalidateByTag(CACHE_TAGS.TRUST_SCORE);

      // Verify tagged keys are gone, untagged remains
      expect(await cacheService.get(key1)).toBeUndefined();
      expect(await cacheService.get(key2)).toBeUndefined();
      expect(await cacheService.get(key3)).toEqual(value3);
    });

    it('does nothing when invalidating a non-existent tag', async () => {
      // This should not throw any errors
      await expect(cacheService.invalidateByTag('non-existent-tag')).resolves.not.toThrow();
    });

    it('correctly tags keys from getOrSet', async () => {
      const key = 'test:getOrSet:tagged';
      const factory = jest.fn().mockResolvedValue({ data: 'getOrSet-tagged' });

      // First call should execute factory and cache the value
      const firstValue = await cacheService.getOrSet(key, factory, 60, CACHE_TAGS.DASHBOARD);
      expect(factory).toHaveBeenCalledTimes(1);
      expect(firstValue).toEqual({ data: 'getOrSet-tagged' });

      // Verify the value is cached
      const cachedValue = await cacheService.get(key);
      expect(cachedValue).toEqual(firstValue);

      // Invalidate by tag
      await cacheService.invalidateByTag(CACHE_TAGS.DASHBOARD);

      // Verify the value is gone
      const afterInvalidate = await cacheService.get(key);
      expect(afterInvalidate).toBeUndefined();

      // Next call to getOrSet should execute factory again
      factory.mockClear();
      const secondValue = await cacheService.getOrSet(key, factory, 60, CACHE_TAGS.DASHBOARD);
      expect(factory).toHaveBeenCalledTimes(1);
      expect(secondValue).toEqual(firstValue);
    });
  });

  describe('basic cache operations', () => {
    it('get returns undefined for non-existent key', async () => {
      const value = await cacheService.get('non-existent-key');
      expect(value).toBeUndefined();
    });

    it('set and get work correctly', async () => {
      const key = 'test:basic:setget';
      const value = { foo: 'bar', num: 42 };
      await cacheService.set(key, value);

      const retrieved = await cacheService.get(key);
      expect(retrieved).toEqual(value);
    });

    it('del deletes an existing key', async () => {
      const key = 'test:basic:del';
      const value = { data: 'to-delete' };
      await cacheService.set(key, value);

      await cacheService.del(key);
      const retrieved = await cacheService.get(key);
      expect(retrieved).toBeUndefined();
    });

    it('delMultiple deletes multiple keys', async () => {
      const key1 = 'test:basic:delmulti1';
      const key2 = 'test:basic:delmulti2';
      await cacheService.set(key1, { data: 'delete1' });
      await cacheService.set(key2, { data: 'delete2' });

      await cacheService.delMultiple([key1, key2]);

      expect(await cacheService.get(key1)).toBeUndefined();
      expect(await cacheService.get(key2)).toBeUndefined();
    });

    it('clear deletes all keys', async () => {
      const key1 = 'test:basic:clear1';
      const key2 = 'test:basic:clear2';
      await cacheService.set(key1, { data: 'clear1' });
      await cacheService.set(key2, { data: 'clear2' });

      await cacheService.clear();

      expect(await cacheService.get(key1)).toBeUndefined();
      expect(await cacheService.get(key2)).toBeUndefined();
    });

    it('getOrSet caches the result of the factory', async () => {
      const key = 'test:basic:getOrSet';
      const factory = jest.fn().mockResolvedValue({ data: 'factory-result' });

      // First call should execute factory
      const firstValue = await cacheService.getOrSet(key, factory);
      expect(factory).toHaveBeenCalledTimes(1);
      expect(firstValue).toEqual({ data: 'factory-result' });

      // Second call should return cached value without executing factory
      factory.mockClear();
      const secondValue = await cacheService.getOrSet(key, factory);
      expect(factory).not.toHaveBeenCalled();
      expect(secondValue).toEqual(firstValue);
    });
  });

  describe('connection and health checks', () => {
    it('isConnected returns true when Redis is available', async () => {
      const isConnected = await cacheService.isConnected();
      expect(isConnected).toBe(true);
    });

    it('getStats returns valid stats with connected status', async () => {
      const stats = await cacheService.getStats();
      expect(stats.connected).toBe(true);
      expect(stats).toHaveProperty('redisInfo');
    });
  });
});