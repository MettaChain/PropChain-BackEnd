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
  {
    prefix: '199.',
    country: 'US',
    region: 'Georgia',
    city: 'Atlanta',
    latitude: 33.749,
    longitude: -84.388,
  },
  {
    prefix: '82.',
    country: 'GB',
    region: 'England',
    city: 'London',
    latitude: 51.5074,
    longitude: -0.1278,
  },
  {
    prefix: '77.',
    country: 'GB',
    region: 'England',
    city: 'Manchester',
    latitude: 53.4808,
    longitude: -2.2426,
  },
  {
    prefix: '200.',
    country: 'BR',
    region: 'Sao Paulo',
    city: 'Sao Paulo',
    latitude: -23.5505,
    longitude: -46.6333,
  },
  {
    prefix: '186.',
    country: 'BR',
    region: 'Rio de Janeiro',
    city: 'Rio de Janeiro',
    latitude: -22.9068,
    longitude: -43.1729,
  },
  {
    prefix: '190.',
    country: 'AR',
    region: 'Buenos Aires',
    city: 'Buenos Aires',
    latitude: -34.6037,
    longitude: -58.3816,
  },
  {
    prefix: '41.',
    country: 'EG',
    region: 'Cairo',
    city: 'Cairo',
    latitude: 30.0444,
    longitude: 31.2357,
  },
  {
    prefix: '102.',
    country: 'NG',
    region: 'Lagos',
    city: 'Lagos',
    latitude: 6.5244,
    longitude: 3.3792,
  },
  {
    prefix: '39.',
    country: 'IN',
    region: 'Maharashtra',
    city: 'Mumbai',
    latitude: 19.076,
    longitude: 72.8777,
  },
  {
    prefix: '49.',
    country: 'IN',
    region: 'Delhi',
    city: 'Delhi',
    latitude: 28.6139,
    longitude: 77.209,
  },
  {
    prefix: '101.',
    country: 'AU',
    region: 'New South Wales',
    city: 'Sydney',
    latitude: -33.8688,
    longitude: 151.2093,
  },
  {
    prefix: '150.',
    country: 'JP',
    region: 'Tokyo',
    city: 'Tokyo',
    latitude: 35.6762,
    longitude: 139.6503,
  },
  {
    prefix: '210.',
    country: 'JP',
    region: 'Osaka',
    city: 'Osaka',
    latitude: 34.6937,
    longitude: 135.5023,
  },
  {
    prefix: '5.',
    country: 'DE',
    region: 'Hesse',
    city: 'Frankfurt',
    latitude: 50.1109,
    longitude: 8.6821,
  },
  {
    prefix: '46.',
    country: 'DE',
    region: 'Berlin',
    city: 'Berlin',
    latitude: 52.52,
    longitude: 13.405,
  },
  {
    prefix: '85.',
    country: 'FR',
    region: 'Ile-de-France',
    city: 'Paris',
    latitude: 48.8566,
    longitude: 2.3522,
  },
  {
    prefix: '88.',
    country: 'FR',
    region: 'Auvergne-Rhone-Alpes',
    city: 'Lyon',
    latitude: 45.764,
    longitude: 4.8357,
  },
  {
    prefix: '95.',
    country: 'ES',
    region: 'Madrid',
    city: 'Madrid',
    latitude: 40.4168,
    longitude: -3.7038,
  },
  {
    prefix: '109.',
    country: 'ES',
    region: 'Catalonia',
    city: 'Barcelona',
    latitude: 41.3874,
    longitude: 2.1686,
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
  return {
    country: country ? country.toUpperCase() : null,
    region,
    city,
    latitude,
    longitude,
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
        ranges.push({ prefix, ...normalised });
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
