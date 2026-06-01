import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { CacheService } from '../../cache/cache.service';
import { CACHE_TTL } from '../../cache/cache.config';

/**
 * PriceHistoryCacheInterceptor
 * Caches price history endpoint responses
 * Validates: Requirements 7.6, 7.7
 */
@Injectable()
export class PriceHistoryCacheInterceptor implements NestInterceptor {
  private readonly logger = new Logger(PriceHistoryCacheInterceptor.name);

  constructor(private readonly cacheService: CacheService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    const { method, path, query, params } = request;

    // Only cache GET requests
    if (method !== 'GET') {
      return next.handle();
    }

    // Only cache price-history endpoints
    if (!path.includes('price-history')) {
      return next.handle();
    }

    // Generate cache key based on endpoint and parameters
    const cacheKey = this.generateCacheKey(path, params, query);

    // Try to get from cache
    const cachedData = await this.cacheService.get(cacheKey);
    if (cachedData) {
      this.logger.debug(`Cache HIT for key: ${cacheKey}`);
      return of(cachedData);
    }

    // If not in cache, execute the handler and cache the result
    return next.handle().pipe(
      tap(async (data) => {
        // Determine TTL based on endpoint type
        let ttl = CACHE_TTL.MEDIUM; // 5 minutes default

        if (path.includes('/chart')) {
          ttl = CACHE_TTL.LONG; // 15 minutes for chart data
        }

        // Cache the response
        await this.cacheService.set(cacheKey, data, ttl, 'price-history');
        this.logger.debug(`Cache SET for key: ${cacheKey} (TTL: ${ttl}s)`);
      }),
    );
  }

  /**
   * Generate cache key from request parameters
   * Format: price-history:{propertyId}:{limit}:{offset}:{sortBy}:{sortOrder}
   * or price-history-chart:{propertyId}:{interval}:{startDate}:{endDate}
   *
   * @param path - Request path
   * @param params - Route parameters
   * @param query - Query parameters
   * @returns Cache key string
   */
  private generateCacheKey(
    path: string,
    params: Record<string, any>,
    query: Record<string, any>,
  ): string {
    const propertyId = params.propertyId || '';

    if (path.includes('/chart')) {
      // Chart data cache key
      const interval = query.interval || 'daily';
      const startDate = query.startDate || '';
      const endDate = query.endDate || '';
      return `price-history-chart:${propertyId}:${interval}:${startDate}:${endDate}`;
    } else if (path.includes('/export')) {
      // Export endpoints are not cached (they're file downloads)
      return '';
    } else {
      // Paginated results cache key
      const limit = query.limit || 50;
      const offset = query.offset || 0;
      const sortBy = query.sortBy || 'timestamp';
      const sortOrder = query.sortOrder || 'DESC';
      return `price-history:${propertyId}:${limit}:${offset}:${sortBy}:${sortOrder}`;
    }
  }
}
