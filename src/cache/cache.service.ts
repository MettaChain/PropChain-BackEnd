/**
 * Cache Service
 * Manages cache operations with custom strategies and invalidation
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { CACHE_KEYS, CACHE_TTL, CACHE_TAGS } from './cache.config';

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private cacheTagMap = new Map<string, Set<string>>();

  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  /**
   * Get cache entry
   */
  async get<T = any>(key: string): Promise<T | undefined> {
    try {
      const value = await this.cacheManager.get<T>(key);
      if (value) {
        this.logger.debug(`Cache HIT: ${key}`);
      } else {
        this.logger.debug(`Cache MISS: ${key}`);
      }
      return value;
    } catch (error) {
      this.logger.error(`Error getting cache key ${key}:`, error);
      return undefined;
    }
  }

  /**
   * Set cache entry
   */
  async set<T = any>(
    key: string,
    value: T,
    ttl: number = CACHE_TTL.MEDIUM,
    tag?: string,
  ): Promise<void> {
    try {
      await this.cacheManager.set(key, value, ttl * 1000);
      if (tag) {
        this.tagKey(tag, key);
      }
      this.logger.debug(`Cache SET: ${key} (TTL: ${ttl}s)`);
    } catch (error) {
      this.logger.error(`Error setting cache key ${key}:`, error);
    }
  }

  /**
   * Delete cache entry
   */
  async del(key: string): Promise<void> {
    try {
      await this.cacheManager.del(key);
      this.logger.debug(`Cache DELETED: ${key}`);
    } catch (error) {
      this.logger.error(`Error deleting cache key ${key}:`, error);
    }
  }

  /**
   * Delete multiple cache entries
   */
  async delMultiple(keys: string[]): Promise<void> {
    try {
      await Promise.all(keys.map((key) => this.cacheManager.del(key)));
      this.logger.debug(`Cache DELETED: ${keys.length} keys`);
    } catch (error) {
      this.logger.error(`Error deleting multiple cache keys:`, error);
    }
  }

  /**
   * Clear all cache
   */
  async clear(): Promise<void> {
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
    } catch (error) {
      this.logger.error('Error clearing cache:', error);
    }
  }

  /**
   * Get or set cache (cache-aside pattern)
   */
  async getOrSet<T = any>(
    key: string,
    factory: () => Promise<T>,
    ttl: number = CACHE_TTL.MEDIUM,
    tag?: string,
  ): Promise<T> {
    try {
      // Try to get from cache
      let value = await this.get<T>(key);

      // If not in cache, fetch and cache it
      if (value === undefined) {
        value = await factory();
        await this.set(key, value, ttl, tag);
      }

      return value;
    } catch (error) {
      this.logger.error(`Error in getOrSet for key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Invalidate cache by tag
   */
  async invalidateByTag(tag: string): Promise<void> {
    try {
      const keys = this.cacheTagMap.get(tag);
      if (keys && keys.size > 0) {
        await this.delMultiple(Array.from(keys));
        this.cacheTagMap.delete(tag);
      }
      this.logger.debug(`Cache invalidated by tag: ${tag}`);
    } catch (error) {
      this.logger.error(`Error invalidating cache by tag ${tag}:`, error);
    }
  }

  /**
   * Tag a cache key for grouped invalidation
   */
  private tagKey(tag: string, key: string): void {
    if (!this.cacheTagMap.has(tag)) {
      this.cacheTagMap.set(tag, new Set());
    }
    this.cacheTagMap.get(tag)!.add(key);
  }

  /**
   * Invalidate user-related cache
   */
  async invalidateUserCache(userId: string): Promise<void> {
    const keys = [
      CACHE_KEYS.USER_BY_ID(userId),
      CACHE_KEYS.DASHBOARD_STATS(userId),
      CACHE_KEYS.DASHBOARD_ANALYTICS(userId),
      CACHE_KEYS.TRUST_SCORE(userId),
      CACHE_KEYS.SESSIONS_BY_USER(userId),
      CACHE_KEYS.AUTH_TOKENS(userId),
    ];
    await this.delMultiple(keys);
  }

  /**
   * Invalidate property-related cache
   */
  async invalidatePropertyCache(propertyId?: string): Promise<void> {
    const keys = [CACHE_KEYS.PROPERTIES_LIST, CACHE_KEYS.PROPERTIES_FEATURED];
    if (propertyId) {
      keys.push(CACHE_KEYS.PROPERTY_BY_ID(propertyId));
    }
    await this.delMultiple(keys);
  }

  /**
   * Invalidate dashboard cache
   */
  async invalidateDashboardCache(userId: string): Promise<void> {
    const keys = [CACHE_KEYS.DASHBOARD_STATS(userId), CACHE_KEYS.DASHBOARD_ANALYTICS(userId)];
    await this.delMultiple(keys);
  }

  /**
   * Invalidate trust score cache
   */
  async invalidateTrustScoreCache(userId?: string): Promise<void> {
    const keys = [CACHE_KEYS.TRUST_SCORES_LEADERBOARD];
    if (userId) {
      keys.push(CACHE_KEYS.TRUST_SCORE(userId));
    }
    await this.delMultiple(keys);
  }

  /**
   * Warm up cache for featured properties
   */
  async warmFeaturedPropertiesCache(factory: () => Promise<any>): Promise<void> {
    try {
      const data = await factory();
      await this.set(
        CACHE_KEYS.PROPERTIES_FEATURED,
        data,
        CACHE_TTL.FEATURED_PROPERTIES,
        CACHE_TAGS.PROPERTIES,
      );
      this.logger.log('Featured properties cache warmed');
    } catch (error) {
      this.logger.error('Error warming featured properties cache:', error);
    }
  }

  /**
   * Warm up cache for trust score leaderboard
   */
  async warmTrustScoreLeaderboardCache(factory: () => Promise<any>): Promise<void> {
    try {
      const data = await factory();
      await this.set(
        CACHE_KEYS.TRUST_SCORES_LEADERBOARD,
        data,
        CACHE_TTL.LEADERBOARD,
        CACHE_TAGS.TRUST_SCORE,
      );
      this.logger.log('Trust score leaderboard cache warmed');
    } catch (error) {
      this.logger.error('Error warming trust score leaderboard cache:', error);
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
   * Check if Redis is connected
   */
  async isConnected(): Promise<boolean> {
    try {
      await this.get('__health_check__');
      return true;
    } catch {
      return false;
    }
  }
}
