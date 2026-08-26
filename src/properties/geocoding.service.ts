import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * The pieces of an address used for geocoding. All fields are optional so
 * partial addresses still produce best-effort results.
 */
export interface GeocodeAddressInput {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  country?: string | null;
}

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  /** Provider-supplied normalized display string, when available. */
  displayName?: string;
}

type GeocodingProvider = 'nominatim' | 'google';

/**
 * GeocodingService converts a postal address into latitude/longitude.
 *
 * Default provider: Nominatim (OpenStreetMap) — free, no API key required.
 * Optional provider: Google Maps Geocoding API — used when
 * `GOOGLE_GEOCODING_API_KEY` is set or `GEOCODING_PROVIDER=google`.
 *
 * Design notes:
 *  - Returns `null` on any failure (network, no result, timeout) so callers
 *    can decide whether to persist the property without coordinates.
 *  - Uses the native `fetch` API (consistent with the rest of the codebase).
 *  - Honors an `AbortController` timeout to avoid hanging requests.
 */
@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);
  private readonly provider: GeocodingProvider;
  private readonly googleApiKey?: string;
  private readonly nominatimBaseUrl: string;
  private readonly userAgent: string;
  private readonly timeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    const explicitProvider = this.configService.get<string>('GEOCODING_PROVIDER', '').toLowerCase();
    this.googleApiKey = this.configService.get<string>('GOOGLE_GEOCODING_API_KEY');

    if (explicitProvider === 'google' || (!explicitProvider && this.googleApiKey)) {
      this.provider = 'google';
    } else {
      this.provider = 'nominatim';
    }

    this.nominatimBaseUrl = this.configService.get<string>(
      'NOMINATIM_BASE_URL',
      'https://nominatim.openstreetmap.org',
    );
    // Nominatim's usage policy requires a descriptive User-Agent.
    this.userAgent = this.configService.get<string>(
      'GEOCODING_USER_AGENT',
      'PropChain-Backend/1.0 (geocoding)',
    );
    this.timeoutMs = this.configService.get<number>('GEOCODING_TIMEOUT_MS', 5000);
  }

  /**
   * Geocode the given address. Returns `null` if no result is found or any
   * error occurs; this is intentional so a failed geocode never blocks a
   * property create/update.
   */
  async geocodeAddress(input: GeocodeAddressInput): Promise<GeocodeResult | null> {
    const query = this.buildQueryString(input);
    if (!query) {
      return null;
    }

    try {
      if (this.provider === 'google' && this.googleApiKey) {
        return await this.geocodeWithGoogle(query);
      }
      return await this.geocodeWithNominatim(query);
    } catch (err) {
      this.logger.warn(
        `Geocoding failed for "${query}" via ${this.provider}: ${(err as Error).message}`,
      );
      return null;
    }
  }

  /**
   * True if any of the address-defining fields differ between two snapshots.
   * Used by callers to decide whether re-geocoding is needed on update.
   */
  hasAddressChanged(before: GeocodeAddressInput, after: GeocodeAddressInput): boolean {
    const keys: (keyof GeocodeAddressInput)[] = ['address', 'city', 'state', 'zipCode', 'country'];
    return keys.some((k) => (before[k] ?? null) !== (after[k] ?? null));
  }

  private buildQueryString(input: GeocodeAddressInput): string {
    return [input.address, input.city, input.state, input.zipCode, input.country]
      .map((p) => (p ?? '').trim())
      .filter((p) => p.length > 0)
      .join(', ');
  }

  private async geocodeWithNominatim(query: string): Promise<GeocodeResult | null> {
    const url = new URL('/search', this.nominatimBaseUrl);
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', '1');
    url.searchParams.set('addressdetails', '0');

    const response = await this.fetchWithTimeout(url.toString(), {
      headers: {
        'User-Agent': this.userAgent,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      this.logger.warn(`Nominatim returned HTTP ${response.status} for "${query}"`);
      return null;
    }

    const data = (await response.json()) as Array<{
      lat: string;
      lon: string;
      display_name?: string;
    }>;

    if (!Array.isArray(data) || data.length === 0) {
      return null;
    }

    const top = data[0];
    const lat = Number(top.lat);
    const lng = Number(top.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return null;
    }
    return { latitude: lat, longitude: lng, displayName: top.display_name };
  }

  private async geocodeWithGoogle(query: string): Promise<GeocodeResult | null> {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('address', query);
    url.searchParams.set('key', this.googleApiKey ?? '');

    const response = await this.fetchWithTimeout(url.toString(), {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      this.logger.warn(`Google geocoding returned HTTP ${response.status} for "${query}"`);
      return null;
    }

    const data = (await response.json()) as {
      status: string;
      results?: Array<{
        formatted_address?: string;
        geometry?: { location?: { lat: number; lng: number } };
      }>;
    };

    if (data.status !== 'OK' || !data.results || data.results.length === 0) {
      if (data.status && data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
        this.logger.warn(`Google geocoding status ${data.status} for "${query}"`);
      }
      return null;
    }

    const top = data.results[0];
    const loc = top.geometry?.location;
    if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) {
      return null;
    }
    return {
      latitude: loc.lat,
      longitude: loc.lng,
      displayName: top.formatted_address,
    };
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }
}
