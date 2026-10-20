import { Injectable, Optional } from '@nestjs/common';
import { CacheService } from '../cache/cache.service';
import { CacheOperationStatus } from '../cache/cache.types';
import { CACHE_TAGS } from '../cache/cache.config';

export const PROPERTY_DETAIL_TTL_SECONDS = 60;

/**
 * Read-through Redis cache for property detail responses (`GET /properties/:id`).
 *
 * Only the read-only detail view is cached. Status transitions, edits, deletes and
 * agent assignment all call `invalidateProperty`, so a stale entry can never
 * outlive a write by more than the TTL.
 *
 * Cache failures never fail a request: on any cache error, or when no cache is
 * available, the loader runs as if caching were off.
 */
@Injectable()
export class PropertiesCacheService {
  constructor(@Optional() private readonly cache?: CacheService) {}

  propertyKey(propertyId: string): string {
    return `properties:detail:${propertyId}`;
  }

  async remember<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
    if (!this.cache) return loader();
    try {
      const hit = await this.cache.get<T>(key);
      if (hit.status === CacheOperationStatus.SUCCESS && hit.data !== undefined) return hit.data as T;
    } catch {
      return loader();
    }
    const value = await loader();
    try {
      await this.cache.set(key, value, ttlSeconds, CACHE_TAGS.PROPERTIES);
    } catch {
      /* a failed write only means the next call recomputes */
    }
    return value;
  }

  /** Cache the property detail view under its own key. */
  rememberPropertyDetail<T>(propertyId: string, loader: () => Promise<T>): Promise<T> {
    return this.remember(this.propertyKey(propertyId), PROPERTY_DETAIL_TTL_SECONDS, loader);
  }

  /**
   * Cache a property detail view only when the row actually exists. A `null`
   * lookup is deliberately not cached: the controller turns it into a 404, and
   * caching that would hide a property created moments later for a whole TTL.
   */
  async rememberExistingProperty<T>(propertyId: string, loader: () => Promise<T>): Promise<T> {
    const value = await this.rememberPropertyDetail(propertyId, loader);
    if (value === null || value === undefined) await this.invalidateProperty(propertyId);
    return value;
  }

  async invalidateProperty(propertyId: string): Promise<void> {
    try {
      await this.cache?.del(this.propertyKey(propertyId));
    } catch {
      /* the entry expires on its own within the TTL */
    }
  }
}
