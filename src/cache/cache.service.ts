/**
 * Cache Service
 * Manages cache operations with custom strategies and invalidation
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { CACHE_KEYS, CACHE_TTL, CACHE_TAGS } from './cache.config';
import {
  CacheResult,
  CacheOperationResult,
  CacheOperationStatus,
  createSuccessResult,
  createMissResult,
  createErrorResult,
  createOperationSuccessResult,
  createOperationErrorResult,
} from './cache.types';
import { CacheMonitoringService } from './cache-monitoring.service';

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private cacheTagMap = new Map<string, Set<string>>();

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private cacheMonitoringService: CacheMonitoringService,
  ) {}

  /**
   * Get cache entry with typed result
   * Returns CacheResult to distinguish between success, miss, and error
   */
  async get<T = any>(key: string): Promise<CacheResult<T>> {
    try {
      const value = await this.cacheManager.get<T>(key);
      if (value) {
        this.logger.debug(`Cache HIT: ${key}`);
        this.cacheMonitoringService.recordHit();
        return createSuccessResult(value);
      } else {
        this.logger.debug(`Cache MISS: ${key}`);
        this.cacheMonitoringService.recordMiss();
        return createMissResult();
      }
    } catch (error) {
      this.logger.error(`Error getting cache key ${key}:`, error);
      this.cacheMonitoringService.recordError();
      return createErrorResult(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Get cache entry (legacy method for backward compatibility)
   * @deprecated Use get() which returns CacheResult for better error handling
   */
  async getLegacy<T = any>(key: string): Promise<T | undefined> {
    const result = await this.get<T>(key);
    return result.status === CacheOperationStatus.SUCCESS ? result.data : undefined;
  }

  /**
   * Set cache entry with typed result
   */
  async set<T = any>(
    key: string,
    value: T,
    ttl: number = CACHE_TTL.MEDIUM,
    tag?: string,
  ): Promise<CacheOperationResult> {
    try {
      await this.cacheManager.set(key, value, ttl * 1000);
      if (tag) {
        this.tagKey(tag, key);
      }
      this.logger.debug(`Cache SET: ${key} (TTL: ${ttl}s)`);
      return createOperationSuccessResult();
    } catch (error) {
      this.logger.error(`Error setting cache key ${key}:`, error);
      this.cacheMonitoringService.recordError();
      return createOperationErrorResult(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Set cache entry (legacy method for backward compatibility)
   * @deprecated Use set() which returns CacheOperationResult for better error handling
   */
  async setLegacy<T = any>(
    key: string,
    value: T,
    ttl: number = CACHE_TTL.MEDIUM,
    tag?: string,
  ): Promise<void> {
    await this.set(key, value, ttl, tag);
  }

  /**
   * Delete cache entry with typed result
   */
  async del(key: string): Promise<CacheOperationResult> {
    try {
      await this.cacheManager.del(key);
      this.logger.debug(`Cache DELETED: ${key}`);
      return createOperationSuccessResult();
    } catch (error) {
      this.logger.error(`Error deleting cache key ${key}:`, error);
      this.cacheMonitoringService.recordError();
      return createOperationErrorResult(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Delete multiple cache entries with typed result
   */
  async delMultiple(keys: string[]): Promise<CacheOperationResult> {
    try {
      await Promise.all(keys.map((key) => this.cacheManager.del(key)));
      this.logger.debug(`Cache DELETED: ${keys.length} keys`);
      return createOperationSuccessResult();
    } catch (error) {
      this.logger.error(`Error deleting multiple cache keys:`, error);
      this.cacheMonitoringService.recordError();
      return createOperationErrorResult(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Clear all cache with typed result
   */
  async clear(): Promise<CacheOperationResult> {
    try {
      // Use reset from underlying store if available
      const store = (this.cacheManager as any).store;
      if (store.reset) {
        await store.reset();
      } else if (store.clear) {
        await store.clear();
      }
      this.cacheTagMap.clear();
      this.logger.log('All cache cleared');
      return createOperationSuccessResult();
    } catch (error) {
      this.logger.error('Error clearing cache:', error);
      this.cacheMonitoringService.recordError();
      return createOperationErrorResult(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Delete cache entry (legacy method for backward compatibility)
   * @deprecated Use del() which returns CacheOperationResult for better error handling
   */
  async delLegacy(key: string): Promise<void> {
    await this.del(key);
  }

  /**
   * Delete multiple cache entries (legacy method for backward compatibility)
   * @deprecated Use delMultiple() which returns CacheOperationResult for better error handling
   */
  async delMultipleLegacy(keys: string[]): Promise<void> {
    await this.delMultiple(keys);
  }

  /**
   * Clear all cache (legacy method for backward compatibility)
   * @deprecated Use clear() which returns CacheOperationResult for better error handling
   */
  async clearLegacy(): Promise<void> {
    await this.clear();
  }

  /**
   * Get or set cache (cache-aside pattern) with typed result
   */
  async getOrSet<T = any>(
    key: string,
    factory: () => Promise<T>,
    ttl: number = CACHE_TTL.MEDIUM,
    tag?: string,
  ): Promise<{ data: T; source: 'cache' | 'factory'; error?: string }> {
    try {
      // Try to get from cache
      const cacheResult = await this.get<T>(key);

      // If cache hit, return cached data
      if (cacheResult.status === CacheOperationStatus.SUCCESS && cacheResult.data) {
        return { data: cacheResult.data, source: 'cache' };
      }

      // If cache error, still try factory but report the error
      if (cacheResult.status === CacheOperationStatus.ERROR) {
        this.logger.warn(`Cache error for key ${key}, falling back to factory: ${cacheResult.error}`);
      }

      // Cache miss or error - fetch and cache it
      const value = await factory();
      const setResult = await this.set(key, value, ttl, tag);
      
      if (setResult.status === CacheOperationStatus.ERROR) {
        this.logger.warn(`Failed to cache value for key ${key}: ${setResult.error}`);
        return { data: value, source: 'factory', error: setResult.error };
      }

      return { data: value, source: 'factory' };
    } catch (error) {
      this.logger.error(`Error in getOrSet for key ${key}:`, error);
      this.cacheMonitoringService.recordError();
      throw error;
    }
  }

  /**
   * Get or set cache (legacy method for backward compatibility)
   * @deprecated Use getOrSet() which returns typed result for better error handling
   */
  async getOrSetLegacy<T = any>(
    key: string,
    factory: () => Promise<T>,
    ttl: number = CACHE_TTL.MEDIUM,
    tag?: string,
  ): Promise<T> {
    const result = await this.getOrSet(key, factory, ttl, tag);
    return result.data;
  }

  /**
   * Invalidate cache by tag with typed result
   */
  async invalidateByTag(tag: string): Promise<CacheOperationResult> {
    try {
      const keys = this.cacheTagMap.get(tag);
      if (keys && keys.size > 0) {
        const result = await this.delMultiple(Array.from(keys));
        if (result.status === CacheOperationStatus.SUCCESS) {
          this.cacheTagMap.delete(tag);
        }
        return result;
      }
      this.logger.debug(`Cache invalidated by tag: ${tag}`);
      return createOperationSuccessResult();
    } catch (error) {
      this.logger.error(`Error invalidating cache by tag ${tag}:`, error);
      this.cacheMonitoringService.recordError();
      return createOperationErrorResult(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Tag a cache key for grouped invalidation
   */
  private tagKey(tag: string, key: string): void {
    const keys = this.cacheTagMap.get(tag) ?? new Set<string>();
    keys.add(key);
    this.cacheTagMap.set(tag, keys);
  }

  /**
   * Invalidate user-related cache with typed result
   */
  async invalidateUserCache(userId: string): Promise<CacheOperationResult> {
    const keys = [
      CACHE_KEYS.USER_BY_ID(userId),
      CACHE_KEYS.DASHBOARD_STATS(userId),
      CACHE_KEYS.DASHBOARD_ANALYTICS(userId),
      CACHE_KEYS.TRUST_SCORE(userId),
      CACHE_KEYS.SESSIONS_BY_USER(userId),
      CACHE_KEYS.AUTH_TOKENS(userId),
    ];
    return this.delMultiple(keys);
  }

  /**
   * Invalidate property-related cache with typed result
   */
  async invalidatePropertyCache(propertyId?: string): Promise<CacheOperationResult> {
    const keys = [CACHE_KEYS.PROPERTIES_LIST, CACHE_KEYS.PROPERTIES_FEATURED];
    if (propertyId) {
      keys.push(CACHE_KEYS.PROPERTY_BY_ID(propertyId));
    }
    return this.delMultiple(keys);
  }

  /**
   * Invalidate dashboard cache with typed result
   */
  async invalidateDashboardCache(userId: string): Promise<CacheOperationResult> {
    const keys = [CACHE_KEYS.DASHBOARD_STATS(userId), CACHE_KEYS.DASHBOARD_ANALYTICS(userId)];
    return this.delMultiple(keys);
  }

  /**
   * Invalidate trust score cache with typed result
   */
  async invalidateTrustScoreCache(userId?: string): Promise<CacheOperationResult> {
    const keys = [CACHE_KEYS.TRUST_SCORES_LEADERBOARD];
    if (userId) {
      keys.push(CACHE_KEYS.TRUST_SCORE(userId));
    }
    return this.delMultiple(keys);
  }

  /**
   * Warm up cache for featured properties with typed result
   */
  async warmFeaturedPropertiesCache(factory: () => Promise<any>): Promise<CacheOperationResult> {
    try {
      const data = await factory();
      const result = await this.set(
        CACHE_KEYS.PROPERTIES_FEATURED,
        data,
        CACHE_TTL.FEATURED_PROPERTIES,
        CACHE_TAGS.PROPERTIES,
      );
      if (result.status === CacheOperationStatus.SUCCESS) {
        this.logger.log('Featured properties cache warmed');
      }
      return result;
    } catch (error) {
      this.logger.error('Error warming featured properties cache:', error);
      this.cacheMonitoringService.recordError();
      return createOperationErrorResult(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Warm up cache for trust score leaderboard with typed result
   */
  async warmTrustScoreLeaderboardCache(factory: () => Promise<any>): Promise<CacheOperationResult> {
    try {
      const data = await factory();
      const result = await this.set(
        CACHE_KEYS.TRUST_SCORES_LEADERBOARD,
        data,
        CACHE_TTL.LEADERBOARD,
        CACHE_TAGS.TRUST_SCORE,
      );
      if (result.status === CacheOperationStatus.SUCCESS) {
        this.logger.log('Trust score leaderboard cache warmed');
      }
      return result;
    } catch (error) {
      this.logger.error('Error warming trust score leaderboard cache:', error);
      this.cacheMonitoringService.recordError();
      return createOperationErrorResult(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<any> {
    try {
      const info = (await (this.cacheManager as any).store.getClient().info?.()) || {};
      return {
        connected: true,
        taggedKeys: this.cacheTagMap.size,
        redisInfo: info,
      };
    } catch (error) {
      this.logger.error('Error getting cache stats:', error);
      return {
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check if Redis is connected with detailed health status
   */
  async isConnected(): Promise<boolean> {
    try {
      await this.get('__health_check__');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get detailed cache health status
   */
  async getHealthStatus(): Promise<{
    connected: boolean;
    latencyMs?: number;
    error?: string;
    memoryUsage?: number;
    keysCount?: number;
  }> {
    const start = Date.now();
    try {
      // Test connectivity with a simple get operation
      const result = await this.get('__health_check__');
      const latency = Date.now() - start;

      // Get additional stats if available
      const stats = await this.getStats();

      return {
        connected: true,
        latencyMs: latency,
        memoryUsage: stats.redisInfo?.used_memory_human,
        keysCount: stats.redisInfo?.db0 ? parseInt(stats.redisInfo.db0.split('=')[1]) : undefined,
      };
    } catch (error) {
      return {
        connected: false,
        latencyMs: Date.now() - start,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Atomic SET NX EX — sets key only if it does not exist.
   * Returns typed result indicating success/failure/error.
   * ttlSeconds: lock expiry to prevent stale locks on crash.
   */
  async setNx(key: string, value: string, ttlSeconds: number): Promise<CacheOperationResult & { acquired: boolean }> {
    try {
      const client = (this.cacheManager as any).store.getClient();
      const result = await client.set(key, value, 'EX', ttlSeconds, 'NX');
      const acquired = result === 'OK';
      return {
        status: CacheOperationStatus.SUCCESS,
        acquired,
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error(`Error in setNx for key ${key}:`, error);
      this.cacheMonitoringService.recordError();
      return {
        status: CacheOperationStatus.ERROR,
        acquired: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
      };
    }
  }
}
