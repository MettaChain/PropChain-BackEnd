/**
 * Default geo lookup provider for the geographic IP middleware (#1610).
 *
 * It follows the offline-safe pattern of `src/fraud/geo-location.service.ts`:
 * a deterministic prefix table is used by default, and an external service can
 * be configured instead (or as a first attempt) without code changes.
 *
 * Configuration:
 *   - `GEO_IP_RANGES`       JSON array of { prefix, country, region, city,
 *                           latitude, longitude } entries. Overrides the
 *                           built-in table when present.
 *   - `GEO_LOOKUP_API_URL`  Optional HTTP endpoint accepting `?ip=<address>`
 *                           and returning the same fields (camelCase or
 *                           snake_case). The offline table remains the
 *                           fallback when the API is unreachable.
 *   - `GEO_LOOKUP_TIMEOUT_MS` Request timeout for the external API (default
 *                           2000ms, clamped to 100..30000).
 */

import { Injectable, Logger } from '@nestjs/common';
import { GeoLookupProvider, GeoLookupResult } from './geographic-ip.types';

interface GeoRange extends GeoLookupResult {
  prefix: string;
}

const DEFAULT_RANGES: ReadonlyArray<GeoRange> = [
  {
    prefix: '8.8.',
    country: 'US',
    region: 'California',
    city: 'Mountain View',
    latitude: 37.4056,
    longitude: -122.0775,
  },
  {
    prefix: '1.1.',
    country: 'US',
    region: 'California',
    city: 'Los Angeles',
    latitude: 34.0522,
    longitude: -118.2437,
  },
  {
    prefix: '208.67.',
    country: 'US',
    region: 'California',
    city: 'San Francisco',
    latitude: 37.7749,
    longitude: -122.4194,
  },
  {
    prefix: '64.233.',
    country: 'US',
    region: 'California',
    city: 'Mountain View',
    latitude: 37.4056,
    longitude: -122.0775,
  },
];

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function normaliseResult(payload: Record<string, unknown>): GeoLookupResult | null {
  const country =
    asString(payload.country) ?? asString(payload.countryCode) ?? asString(payload.country_code);
  const region =
    asString(payload.region) ?? asString(payload.regionName) ?? asString(payload.region_name);
  const city = asString(payload.city);
  const latitude = asNumber(payload.latitude) ?? asNumber(payload.lat);
  const longitude = asNumber(payload.longitude) ?? asNumber(payload.lng) ?? asNumber(payload.lon);

  if (!country && !region && !city && latitude === null && longitude === null) {
    return null;
  }
  const accuracy = payload.accuracy === 'approximate' ? 'approximate' : 'exact';
  return {
    country: country ? country.toUpperCase() : null,
    region,
    city,
    latitude,
    longitude,
    accuracy,
  };
}

function parseConfiguredRanges(raw: string | undefined): ReadonlyArray<GeoRange> | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return null;
    }
    const ranges: GeoRange[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }
      const record = entry as Record<string, unknown>;
      const prefix = asString(record.prefix);
      if (!prefix) {
        continue;
      }
      const normalised = normaliseResult(record);
      if (normalised) {
        ranges.push({ prefix, ...normalised, accuracy: 'approximate' });
      }
    }
    return ranges.length > 0 ? ranges : null;
  } catch {
    return null;
  }
}

@Injectable()
export class ConfigurableGeoLookupProvider implements GeoLookupProvider {
  private readonly logger = new Logger(ConfigurableGeoLookupProvider.name);
  private readonly ranges: ReadonlyArray<GeoRange>;
  private readonly apiUrl: string | null;
  private readonly apiTimeoutMs: number;

  constructor(
    ranges?: ReadonlyArray<GeoRange> | null,
    apiUrl: string | null = process.env.GEO_LOOKUP_API_URL ?? null,
    apiTimeoutMs = Number.parseInt(process.env.GEO_LOOKUP_TIMEOUT_MS ?? '', 10),
  ) {
    this.ranges = ranges ?? parseConfiguredRanges(process.env.GEO_IP_RANGES) ?? DEFAULT_RANGES;
    this.apiUrl = apiUrl && apiUrl.trim().length > 0 ? apiUrl.trim() : null;
    this.apiTimeoutMs = Number.isFinite(apiTimeoutMs)
      ? Math.min(Math.max(apiTimeoutMs, 100), 30_000)
      : 2_000;
  }

  async lookup(ipAddress: string): Promise<GeoLookupResult | null> {
    if (this.apiUrl) {
      const fromApi = await this.lookupRemote(ipAddress);
      if (fromApi) {
        return fromApi;
      }
    }
    return this.lookupOffline(ipAddress);
  }

  private lookupOffline(ipAddress: string): GeoLookupResult | null {
    for (const range of this.ranges) {
      if (ipAddress.startsWith(range.prefix)) {
        return {
          country: range.country,
          region: range.region,
          city: range.city,
          latitude: range.latitude,
          longitude: range.longitude,
          accuracy: range.accuracy ?? 'approximate',
        };
      }
    }
    return null;
  }

  private async lookupRemote(ipAddress: string): Promise<GeoLookupResult | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.apiTimeoutMs);
    try {
      const url = new URL(this.apiUrl as string);
      url.searchParams.set('ip', ipAddress);
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: { accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) {
        this.logger.debug(`Geo API returned ${response.status} for ${ipAddress}`);
        return null;
      }
      const payload: unknown = await response.json();
      if (!payload || typeof payload !== 'object') {
        return null;
      }
      return normaliseResult(payload as Record<string, unknown>);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.debug(`Geo API lookup failed for ${ipAddress}: ${message}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
