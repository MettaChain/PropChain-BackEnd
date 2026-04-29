/**
 * Cache Module
 * Comprehensive caching layer with Redis, monitoring, and warming
 */

import { Module, Global } from '@nestjs/common';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { REDIS_CONFIG } from './cache.config';
import { CacheService } from './cache.service';
import { CacheMonitoringService } from './cache-monitoring.service';
import { CacheWarmingService } from './cache-warming.service';
import { CacheMetricsInterceptor } from './cache-metrics.interceptor';
import { CacheHeadersInterceptor } from './cache-headers.interceptor';
import { CacheStatsController } from './cache-stats.controller';

@Global()
@Module({
  imports: [NestCacheModule.register(REDIS_CONFIG)],
  controllers: [CacheStatsController],
  providers: [
    CacheService,
    CacheMonitoringService,
    CacheWarmingService,
    CacheMetricsInterceptor,
    CacheHeadersInterceptor,
  ],
  exports: [
    CacheService,
    CacheMonitoringService,
    CacheWarmingService,
    CacheMetricsInterceptor,
    CacheHeadersInterceptor,
  ],
})
export class CacheModuleConfig {}
