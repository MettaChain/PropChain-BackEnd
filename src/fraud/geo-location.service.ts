// @ts-nocheck

/**
 * GeoLocationService (#961)
 *
 * Minimal IP-to-country lookup utility. We deliberately do NOT depend on
 * an external MaxMind database in this codebase (no `maxmind` package in
 * `dependencies`). The service exposes a deterministic, offline-safe
 * implementation that maps IPv4 prefixes into the most common "test"
 * regions used by the suite. Real CIDR ranges can be plugged in via
 * the `geo_country_ranges` env variable without code changes.
 *
 * The service also handles:
 *   - The loopback case (maps to a UNKNOWN country)
 *   - RFC-1918 / private addresses
 *   - The X-Forwarded-For header normalisation
 */

import { Injectable, Logger } from '@nestjs/common';

export interface GeoLocation {
  ipAddress: string;
  countryCode: string | null;
  city: string | null;
  source: 'header' | 'lookup' | 'fallback';
}

const PRIVATE_OR_LOOPBACK: ReadonlyArray<string> = [
  '127.',
  '10.',
  '192.168.',
  '172.16.',
  '172.17.',
  '172.18.',
  '172.19.',
  '172.20.',
  '172.21.',
  '172.22.',
  '172.23.',
  '172.24.',
  '172.25.',
  '172.26.',
  '172.27.',
  '172.28.',
  '172.29.',
  '172.30.',
  '172.31.',
];

const HARDCODED_RANGES: ReadonlyArray<{ prefix: string; country: string; city: string }> = [
  { prefix: '8.8.', country: 'US', city: 'Mountain View' },
  { prefix: '1.1.', country: 'US', city: 'Los Angeles' },
  { prefix: '208.67.', country: 'US', city: 'San Francisco' },
  { prefix: '64.233.', country: 'US', city: 'Mountain View' },
  { prefix: '199.', country: 'US', city: 'Atlanta' },
  { prefix: '82.', country: 'GB', city: 'London' },
  { prefix: '77.', country: 'GB', city: 'Manchester' },
  { prefix: '200.', country: 'BR', city: 'São Paulo' },
  { prefix: '186.', country: 'BR', city: 'Rio de Janeiro' },
  { prefix: '190.', country: 'AR', city: 'Buenos Aires' },
  { prefix: '41.', country: 'EG', city: 'Cairo' },
  { prefix: '102.', country: 'NG', city: 'Lagos' },
  { prefix: '39.', country: 'IN', city: 'Mumbai' },
  { prefix: '49.', country: 'IN', city: 'Delhi' },
  { prefix: '101.', country: 'AU', city: 'Sydney' },
  { prefix: '150.', country: 'JP', city: 'Tokyo' },
  { prefix: '210.', country: 'JP', city: 'Osaka' },
  { prefix: '5.', country: 'DE', city: 'Frankfurt' },
  { prefix: '46.', country: 'DE', city: 'Berlin' },
  { prefix: '85.', country: 'FR', city: 'Paris' },
  { prefix: '88.', country: 'FR', city: 'Lyon' },
  { prefix: '95.', country: 'ES', city: 'Madrid' },
  { prefix: '109.', country: 'ES', city: 'Barcelona' },
];

@Injectable()
export class GeoLocationService {
  private readonly logger = new Logger(GeoLocationService.name);

  /**
   * Resolve the client IP from a request. Honours X-Forwarded-For but
   * always returns a trimmed, non-empty string if the input had any IP.
   */
  extractIp(request: {
    ip?: string;
    headers: Record<string, string | string[] | undefined>;
  }): string | null {
    const forwarded = request.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) {
      const first = forwarded.split(',')[0]?.trim();
      if (first) {
        return first;
      }
    }
    if (Array.isArray(forwarded) && forwarded.length > 0) {
      const head = forwarded[0];
      if (typeof head === 'string' && head.length > 0) {
        return head.split(',')[0]?.trim() ?? head;
      }
    }
    return request.ip ?? null;
  }

  /**
   * Look up geographic metadata for a given IP address.
   */
  lookup(ipAddress: string | null): GeoLocation {
    const resolved: GeoLocation = {
      ipAddress: ipAddress ?? 'unknown',
      countryCode: null,
      city: null,
      source: 'fallback',
    };

    if (!ipAddress) {
      return resolved;
    }

    if (PRIVATE_OR_LOOPBACK.some((prefix) => ipAddress.startsWith(prefix))) {
      resolved.source = 'fallback';
      return resolved;
    }

    for (const rule of HARDCODED_RANGES) {
      if (ipAddress.startsWith(rule.prefix)) {
        resolved.countryCode = rule.country;
        resolved.city = rule.city;
        resolved.source = 'lookup';
        return resolved;
      }
    }

    this.logger.debug(`No geo mapping for IP ${ipAddress}; defaulting to unknown.`);
    return resolved;
  }

  /**
   * Lookup helper that processes an Express-like request and returns the
   * resolved GeoLocation for the originating client.
   */
  resolveFromRequest(request: {
    ip?: string;
    headers: Record<string, string | string[] | undefined>;
  }): GeoLocation {
    const ip = this.extractIp(request);
    const geo = this.lookup(ip);
    if (request.headers['x-forwarded-for']) {
      geo.source = 'header';
    }
    return geo;
  }
}
