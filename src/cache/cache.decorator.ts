/**
 * Cache Decorators
 * Decorators for easy caching in controllers and services
 */

import { Inject } from '@nestjs/common';
import { CacheService } from './cache.service';
import { CACHE_TTL } from './cache.config';

/**
 * Decorator to inject CacheService
 */
export function InjectCacheService() {
  return Inject(CacheService);
}

/**
 * Note: For method-level caching, use NestJS @Cacheable decorator
 * or implement within your service methods directly using CacheService
 */
