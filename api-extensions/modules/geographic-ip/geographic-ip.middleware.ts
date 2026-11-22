/**
 * Geographic IP middleware (#1610).
 *
 * Resolves the client IP into country/region/city/coordinates and attaches the
 * result to `req.geo` for geo-targeted features and fraud detection.
 *
 * - Private, loopback and link-local addresses never leave the process and are
 *   never cached.
 * - Resolved public lookups are cached in Redis (24h by default) when the
 *   module is registered with a cache; a cache failure degrades to a direct
 *   lookup instead of failing the request.
 * - The lookup provider is pluggable through `GEO_LOOKUP_PROVIDER`.
 */

import { Inject, Injectable, Logger, NestMiddleware, Optional } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { isIP } from 'net';
import { ConfigurableGeoLookupProvider } from './geo-lookup.provider';
import {
  DEFAULT_GEO_CACHE_PREFIX,
  DEFAULT_GEO_CACHE_TTL_SECONDS,
  GEO_CACHE,
  GEO_LOOKUP_PROVIDER,
  GEOGRAPHIC_IP_OPTIONS,
  GeoCache,
  GeoLocationData,
  GeoLookupProvider,
  GeoLookupResult,
  GeographicIpOptions,
} from './geographic-ip.types';

interface RequestWithGeo extends Request {
  geo?: GeoLocationData;
}

const CACHE_ENTRY_FIELDS = ['country', 'region', 'city', 'latitude', 'longitude'] as const;

export function isTrustProxyEnabled(): boolean {
  const value = process.env.TRUST_PROXY;
  if (value === undefined || value === '') {
    return false;
  }
  return !['false', '0', 'none', 'off'].includes(value.trim().toLowerCase());
}

export function extractClientIp(request: {
  ip?: string;
  ips?: string[];
  socket?: { remoteAddress?: string };
  connection?: { remoteAddress?: string };
}): string | null {
  const candidates: string[] = [];
  if (request.ip) {
    candidates.push(request.ip);
  }
  if (isTrustProxyEnabled() && Array.isArray(request.ips)) {
    candidates.push(...request.ips);
  }
  if (request.socket?.remoteAddress) {
    candidates.push(request.socket.remoteAddress);
  }
  if (request.connection?.remoteAddress) {
    candidates.push(request.connection.remoteAddress);
  }

  for (const candidate of candidates) {
    const trimmed = candidate.trim().replace(/^\[/, '').replace(/\]$/, '');
    if (!trimmed) {
      continue;
    }
    const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(trimmed);
    const value = mapped?.[1] ?? trimmed;
    if (isIP(value) !== 0) {
      return value;
    }
  }
  return null;
}

export function isPrivateIpAddress(ipAddress: string): boolean {
  const value = ipAddress.trim().toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
  if (!value) {
    return true;
  }
  if (value === '::1' || value === '::' || value === 'localhost') {
    return true;
  }
  // Unique-local (fc00::/7) and link-local (fe80::/10) IPv6 ranges.
  if (
    value.startsWith('fc') ||
    value.startsWith('fd') ||
    value.startsWith('fe8') ||
    value.startsWith('fe9') ||
    value.startsWith('fea') ||
    value.startsWith('feb')
  ) {
    return true;
  }

  const octets = value.split('.').map((part) => Number.parseInt(part, 10));
  if (
    octets.length !== 4 ||
    octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }
  const [first, second] = octets as [number, number, number, number];
  if (first === 10 || first === 127 || first === 0) {
    return true;
  }
  if (first === 192 && second === 168) {
    return true;
  }
  if (first === 172 && second >= 16 && second <= 31) {
    return true;
  }
  if (first === 169 && second === 254) {
    return true;
  }
  // Carrier-grade NAT.
  if (first === 100 && second >= 64 && second <= 127) {
    return true;
  }
  return false;
}

function emptyLocation(ipAddress: string, isPrivate: boolean): GeoLocationData {
  return {
    ipAddress,
    country: null,
    region: null,
    city: null,
    latitude: null,
    longitude: null,
    lat: null,
    lng: null,
    isPrivate,
    source: 'fallback',
    accuracy: 'approximate',
  };
}

function toLocation(
  ipAddress: string,
  result: GeoLookupResult,
  source: GeoLocationData['source'],
  isPrivate: boolean,
): GeoLocationData {
  return {
    ...result,
    ipAddress,
    lat: result.latitude,
    lng: result.longitude,
    isPrivate,
    source,
    accuracy: result.accuracy ?? 'approximate',
  };
}

function isGeoLookupResult(value: unknown): value is GeoLookupResult {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return CACHE_ENTRY_FIELDS.some((field) => record[field] !== undefined && record[field] !== null);
}

@Injectable()
export class GeographicIpMiddleware implements NestMiddleware {
  private readonly logger = new Logger(GeographicIpMiddleware.name);
  private readonly provider: GeoLookupProvider;
  private readonly cache?: GeoCache;
  private readonly cacheTtlSeconds: number;
  private readonly cachePrefix: string;

  constructor(
    @Optional()
    @Inject(GEO_LOOKUP_PROVIDER)
    provider?: GeoLookupProvider | null,
    @Optional()
    @Inject(GEO_CACHE)
    cache?: GeoCache | null,
    @Optional()
    @Inject(GEOGRAPHIC_IP_OPTIONS)
    options?: Partial<GeographicIpOptions> | null,
  ) {
    this.provider = provider ?? new ConfigurableGeoLookupProvider();
    this.cache = cache ?? undefined;
    this.cacheTtlSeconds =
      options?.cacheTtlSeconds && options.cacheTtlSeconds > 0
        ? options.cacheTtlSeconds
        : DEFAULT_GEO_CACHE_TTL_SECONDS;
    this.cachePrefix = options?.cachePrefix ?? DEFAULT_GEO_CACHE_PREFIX;
  }

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const request = req as RequestWithGeo;
    const ipAddress = extractClientIp(request);

    if (!ipAddress || isPrivateIpAddress(ipAddress)) {
      request.geo = emptyLocation(ipAddress ?? 'unknown', true);
      next();
      return;
    }

    const cacheKey = `${this.cachePrefix}${ipAddress}`;
    const cached = await this.readCache(cacheKey);
    if (cached) {
      request.geo = toLocation(ipAddress, cached, 'cache', false);
      next();
      return;
    }

    const result = await this.lookup(ipAddress);
    if (!result) {
      request.geo = emptyLocation(ipAddress, false);
      next();
      return;
    }

    request.geo = toLocation(ipAddress, result, 'lookup', false);
    await this.writeCache(cacheKey, result);
    next();
  }

  private async lookup(ipAddress: string): Promise<GeoLookupResult | null> {
    try {
      return await this.provider.lookup(ipAddress);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Geo lookup failed for ${ipAddress}: ${message}`);
      return null;
    }
  }

  private async readCache(key: string): Promise<GeoLookupResult | null> {
    if (!this.cache) {
      return null;
    }
    try {
      const raw = await this.cache.get(key);
      if (!raw) {
        return null;
      }
      const parsed: unknown = JSON.parse(raw);
      return isGeoLookupResult(parsed) ? parsed : null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.debug(`Geo cache read failed for ${key}: ${message}`);
      return null;
    }
  }

  private async writeCache(key: string, value: GeoLookupResult): Promise<void> {
    if (!this.cache) {
      return;
    }
    try {
      await this.cache.set(key, JSON.stringify(value), this.cacheTtlSeconds);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.debug(`Geo cache write failed for ${key}: ${message}`);
    }
  }
}
