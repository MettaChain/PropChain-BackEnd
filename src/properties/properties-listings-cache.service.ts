import { createHash } from 'crypto';
import { Injectable, Optional } from '@nestjs/common';
import { CacheService } from '../cache/cache.service';
import { CacheOperationStatus } from '../cache/cache.types';
import { CACHE_TAGS } from '../cache/cache.config';
import { SearchPropertiesDto } from './dto/search-properties.dto';
import { listingCacheLookupsTotal } from './listings-metrics';

/**
 * Search results are cached for this long. Deliberately short: a listing can be
 * published, repriced or taken down at any moment, and the public feed is the
 * one surface where showing a stale listing is immediately visible.
 */
export const LISTING_SEARCH_TTL_SECONDS = 30;

/** Longest key we will build. Anything longer is used uncached. */
const MAX_KEY_SOURCE_LENGTH = 2_048;

/**
 * Build a stable cache key from a search query.
 *
 * Object key order is normalised, and absent filters are dropped, so
 * `?city=Austin` and `?page=1` produce the same key as an empty query rather
 * than one key per permutation of the same filter set.
 */
export function listingSearchCacheKey(dto: SearchPropertiesDto): string | null {
  const defined = Object.entries((dto ?? {}) as Record<string, unknown>)
    .filter(([, value]) => value !== undefined && value !== null)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  if (defined.length === 0) return null;

  const source = JSON.stringify(defined);
  if (source.length > MAX_KEY_SOURCE_LENGTH) return null;

  return `properties:search:${createHash('sha1').update(source).digest('hex')}`;
}

/**
 * Short-lived read-through cache for public listing search results.
 *
 * Only `GET /properties/search` is cached. The unpaged `GET /properties` feed is
 * not: its result set changes on every write and it is the cheapest of the two,
 * so caching it mostly adds invalidation risk for little gain.
 *
 * Cache failures never fail a request: on any cache error, or when no cache is
 * available, the loader runs as if caching were off.
 */
@Injectable()
export class PropertiesListingsCacheService {
  constructor(@Optional() private readonly cache?: CacheService) {}

  async rememberSearch<T>(dto: SearchPropertiesDto, loader: () => Promise<T>): Promise<T> {
    const key = listingSearchCacheKey(dto);
    if (!this.cache || !key) {
      listingCacheLookupsTotal.inc({ outcome: 'bypass' });
      return loader();
    }

    try {
      const hit = await this.cache.get<T>(key);
      if (hit.status === CacheOperationStatus.SUCCESS && hit.data !== undefined) {
        listingCacheLookupsTotal.inc({ outcome: 'hit' });
        return hit.data as T;
      }
    } catch {
      listingCacheLookupsTotal.inc({ outcome: 'bypass' });
      return loader();
    }

    listingCacheLookupsTotal.inc({ outcome: 'miss' });
    const value = await loader();
    try {
      await this.cache.set(key, value, LISTING_SEARCH_TTL_SECONDS, CACHE_TAGS.PROPERTIES);
    } catch {
      /* a failed write only means the next call recomputes */
    }
    return value;
  }
}
