/**
 * Cache Warming Service
 * Pre-loads frequently accessed data on startup
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CacheService } from './cache.service';
import { CACHE_KEYS, CACHE_TTL } from './cache.config';

@Injectable()
export class CacheWarmingService implements OnModuleInit {
  private readonly logger = new Logger(CacheWarmingService.name);

  constructor(private cacheService: CacheService) {}

  async onModuleInit(): Promise<void> {
    if (process.env.CACHE_WARMING_ENABLED === 'true') {
      this.logger.log('Starting cache warming...');
      await this.warmCache();
    }
  }

  /**
   * Warm up cache with frequently accessed data
   */
  private async warmCache(): Promise<void> {
    try {
      // Warm up static/system data that doesn't change often
      await this.warmSystemCache();

      // Schedule periodic cache warming
      if (process.env.CACHE_WARMING_INTERVAL) {
        const interval = parseInt(process.env.CACHE_WARMING_INTERVAL, 10);
        setInterval(() => this.warmCache(), interval);
        this.logger.log(`Cache warming scheduled every ${interval}ms`);
      }
    } catch (error) {
      this.logger.error('Error warming cache:', error);
    }
  }

  /**
   * Warm system cache
   */
  private async warmSystemCache(): Promise<void> {
    try {
      // Add system-level cache warming here
      // Example: popular properties, top-rated users, etc.

      this.logger.log('System cache warming completed');
    } catch (error) {
      this.logger.error('Error warming system cache:', error);
    }
  }

  /**
   * Warm specific user cache
   */
  async warmUserCache(userId: string, userData: any): Promise<void> {
    try {
      await this.cacheService.set(CACHE_KEYS.USER_BY_ID(userId), userData, CACHE_TTL.USER_PROFILE);
      this.logger.debug(`User cache warmed for ${userId}`);
    } catch (error) {
      this.logger.error(`Error warming user cache for ${userId}:`, error);
    }
  }

  /**
   * Warm dashboard cache
   */
  async warmDashboardCache(userId: string, dashboardData: any): Promise<void> {
    try {
      await this.cacheService.set(
        CACHE_KEYS.DASHBOARD_STATS(userId),
        dashboardData,
        CACHE_TTL.DASHBOARD_STATS,
      );
      this.logger.debug(`Dashboard cache warmed for ${userId}`);
    } catch (error) {
      this.logger.error(`Error warming dashboard cache for ${userId}:`, error);
    }
  }

  /**
   * Warm trust score leaderboard
   */
  async warmLeaderboardCache(leaderboardData: any): Promise<void> {
    try {
      await this.cacheService.set(
        CACHE_KEYS.TRUST_SCORES_LEADERBOARD,
        leaderboardData,
        CACHE_TTL.LEADERBOARD,
      );
      this.logger.debug('Leaderboard cache warmed');
    } catch (error) {
      this.logger.error('Error warming leaderboard cache:', error);
    }
  }

  /**
   * Warm featured properties cache
   */
  async warmFeaturedPropertiesCache(propertiesData: any): Promise<void> {
    try {
      await this.cacheService.set(
        CACHE_KEYS.PROPERTIES_FEATURED,
        propertiesData,
        CACHE_TTL.FEATURED_PROPERTIES,
      );
      this.logger.debug('Featured properties cache warmed');
    } catch (error) {
      this.logger.error('Error warming featured properties cache:', error);
    }
  }
}
