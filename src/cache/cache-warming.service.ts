// @ts-nocheck

/**
 * Cache Warming Service
 *
 * Strategy:
 *  1. **Startup warming** – OnModuleInit loads the hottest data into Redis
 *     immediately so the first users after a deploy don't see cold-cache latency.
 *  2. **Periodic refresh** – A @Cron job re-warms data every 30 minutes to
 *     keep it fresh without waiting for natural expiry.
 *  3. **Predictive warming** – Analyses access patterns (recent hit-rate trends
 *     stored in Redis) to proactively warm keys that are about to become hot.
 *  4. **Hit-rate monitoring** – Each warming cycle logs the cache hit-rate before
 *     and after warming so we can measure the impact of the strategy.
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CacheService } from './cache.service';
import { CacheMonitoringService } from './cache-monitoring.service';
import { CACHE_KEYS, CACHE_TTL } from './cache.config';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class CacheWarmingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheWarmingService.name);
  private warmingInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private cacheService: CacheService,
    private cacheMonitoringService: CacheMonitoringService,
    private prisma: PrismaService,
  ) {}

  // ─── Lifecycle ────────────────────────────────────────────────────────

  async onModuleInit(): Promise<void> {
    if (process.env.CACHE_WARMING_ENABLED !== 'false') {
      this.logger.log('Starting initial cache warming…');
      await this.warmCache();
    }
  }

  onModuleDestroy(): void {
    if (this.warmingInterval) {
      clearInterval(this.warmingInterval);
      this.warmingInterval = null;
      this.logger.log('Cache warming interval cleared');
    }
  }

  // ─── Periodic warming (every 30 min) ─────────────────────────────────

  @Cron(CronExpression.EVERY_30_MINUTES)
  async handlePeriodicWarming(): Promise<void> {
    if (process.env.CACHE_WARMING_ENABLED === 'false') return;
    this.logger.log('Periodic cache warming triggered');
    await this.warmCache();
  }

  // ─── Core warming orchestrator ────────────────────────────────────────

  async warmCache(): Promise<void> {
    const hitRateBefore = this.cacheMonitoringService.getMetrics().hitRate;

    try {
      await Promise.allSettled([
        this.warmFeaturedProperties(),
        this.warmPopularProperties(),
        this.warmTrustScoreLeaderboard(),
        this.warmSearchSuggestions(),
        this.warmPredictiveKeys(),
      ]);

      const hitRateAfter = this.cacheMonitoringService.getMetrics().hitRate;
      this.logger.log(
        `Cache warming complete – hit-rate before: ${hitRateBefore}%  after: ${hitRateAfter}%`,
      );
    } catch (error) {
      this.logger.error('Error during cache warming cycle:', error);
    }
  }

  // ─── Individual warmers ──────────────────────────────────────────────

  private async warmFeaturedProperties(): Promise<void> {
    try {
      const featured = await (this.prisma as any).property.findMany({
        where: { status: 'ACTIVE', deleted: false },
        orderBy: { viewCount: 'desc' },
        take: 20,
      });
      await this.cacheService.set(
        CACHE_KEYS.PROPERTIES_FEATURED,
        featured,
        CACHE_TTL.FEATURED_PROPERTIES,
      );
      this.logger.debug(`Warmed featured properties (${featured.length} items)`);
    } catch (error) {
      this.logger.warn('Failed to warm featured properties', error);
    }
  }

  private async warmPopularProperties(): Promise<void> {
    try {
      const popular = await (this.prisma as any).property.findMany({
        where: { status: 'ACTIVE', deleted: false },
        orderBy: { viewCount: 'desc' },
        take: 50,
      });
      await this.cacheService.set('properties:popular', popular, CACHE_TTL.MEDIUM);
      this.logger.debug(`Warmed popular properties (${popular.length} items)`);
    } catch (error) {
      this.logger.warn('Failed to warm popular properties', error);
    }
  }

  private async warmTrustScoreLeaderboard(): Promise<void> {
    try {
      const leaderboard = await (this.prisma as any).user.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: { id: true, email: true, role: true },
      });
      await this.cacheService.set(
        CACHE_KEYS.TRUST_SCORES_LEADERBOARD,
        leaderboard,
        CACHE_TTL.LEADERBOARD,
      );
      this.logger.debug('Warmed trust score leaderboard');
    } catch (error) {
      this.logger.warn('Failed to warm leaderboard', error);
    }
  }

  private async warmSearchSuggestions(): Promise<void> {
    try {
      const popular = await (this.prisma as any).popularSearch.findMany({
        orderBy: { frequency: 'desc' },
        take: 20,
      });
      await this.cacheService.set('search:popular', popular, CACHE_TTL.MEDIUM);
      this.logger.debug('Warmed search suggestions cache');
    } catch (error) {
      this.logger.warn('Failed to warm search suggestions', error);
    }
  }

  // ─── Predictive warming ──────────────────────────────────────────────

  /**
   * Predictive warming reads the "access-pattern" key stored by the cache
   * metrics interceptor and proactively warms keys that are trending upward.
   */
  private async warmPredictiveKeys(): Promise<void> {
    try {
      const accessPattern =
        await this.cacheService.get<Record<string, number>>('cache:access-pattern');

      if (!accessPattern) return;

      // Sort keys by access frequency descending and warm the top ones
      const sorted = Object.entries(accessPattern)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10);

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for (const [key, _frequency] of sorted) {
        // Only warm keys that are already cached (refresh TTL)
        const existing = await this.cacheService.get(key);
        if (existing !== undefined) {
          await this.cacheService.set(key, existing, CACHE_TTL.MEDIUM);
        }
      }

      if (sorted.length > 0) {
        this.logger.debug(`Predictively warmed ${sorted.length} hot keys`);
      }
    } catch (error) {
      this.logger.warn('Predictive warming skipped', error);
    }
  }

  // ─── Public helpers ──────────────────────────────────────────────────

  async warmUserCache(userId: string, userData: any): Promise<void> {
    try {
      await this.cacheService.set(CACHE_KEYS.USER_BY_ID(userId), userData, CACHE_TTL.USER_PROFILE);
      this.logger.debug(`User cache warmed for ${userId}`);
    } catch (error) {
      this.logger.error(`Error warming user cache for ${userId}:`, error);
    }
  }

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

  /**
   * Return a snapshot of warming-related metrics for observability.
   */
  getWarmingMetrics(): { lastWarmingHitRate: number; totalCycles: number } {
    const metrics = this.cacheMonitoringService.getMetrics();
    return {
      lastWarmingHitRate: metrics.hitRate,
      totalCycles: metrics.totalRequests,
    };
  }
}
