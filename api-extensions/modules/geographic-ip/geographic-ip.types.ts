/**
 * Shared contracts for the geographic IP extension (#1610).
 *
 * The middleware itself only depends on these small interfaces, so the lookup
 * provider and the cache can be swapped (offline table, external API, Redis,
 * in-memory) without touching the request handling logic.
 */

export interface GeoLookupResult {
  country: string | null;
  region: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface GeoLocationData extends GeoLookupResult {
  ipAddress: string;
  isPrivate: boolean;
  source: 'cache' | 'lookup' | 'fallback';
  /** Alias of `latitude`, matching the acceptance-criteria naming. */
  lat: number | null;
  /** Alias of `longitude`, matching the acceptance-criteria naming. */
  lng: number | null;
}

export interface GeoLookupProvider {
  lookup(ipAddress: string): Promise<GeoLookupResult | null>;
}

export interface GeoCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<unknown>;
}

export interface GeographicIpOptions {
  /** How long a resolved location is cached. Defaults to 24 hours. */
  cacheTtlSeconds: number;
  /** Prefix used to namespace cache entries. */
  cachePrefix: string;
}

export const GEO_LOOKUP_PROVIDER = Symbol('GEO_LOOKUP_PROVIDER');
export const GEO_CACHE = Symbol('GEO_CACHE');
export const GEOGRAPHIC_IP_OPTIONS = Symbol('GEOGRAPHIC_IP_OPTIONS');

export const DEFAULT_GEO_CACHE_TTL_SECONDS = 24 * 60 * 60;
export const DEFAULT_GEO_CACHE_PREFIX = 'geo:ip:';
