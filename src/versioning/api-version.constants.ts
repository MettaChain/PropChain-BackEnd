// @ts-nocheck

/**
 * API Version Constants and Definitions
 * Manages API versioning strategy, deprecated versions, and version metadata
 */

export enum ApiVersionEnum {
  V1 = 'v1',
  V2 = 'v2',
}

export interface ApiVersionMetadata {
  version: ApiVersionEnum;
  released: Date;
  status: 'active' | 'deprecated' | 'sunset';
  sunsetDate?: Date;
  documentation?: string;
  changesSummary?: string;
}

export const API_VERSIONS: Record<ApiVersionEnum, ApiVersionMetadata> = {
  [ApiVersionEnum.V1]: {
    version: ApiVersionEnum.V1,
    released: new Date('2026-01-01'),
    status: 'deprecated',
    sunsetDate: new Date('2026-12-31'),
    documentation: 'https://docs.propchain.io/v1',
    changesSummary: 'Initial API version',
  },
  [ApiVersionEnum.V2]: {
    version: ApiVersionEnum.V2,
    released: new Date('2026-04-01'),
    status: 'active',
    documentation: 'https://docs.propchain.io/v2',
    changesSummary: 'Enhanced with versioning support and new endpoints',
  },
};

export const DEFAULT_API_VERSION = ApiVersionEnum.V2;
export const SUPPORTED_API_VERSIONS = Object.keys(API_VERSIONS) as ApiVersionEnum[];

/**
 * Minimum deprecation notice period in days (RFC requirement)
 */
export const MIN_DEPRECATION_NOTICE_DAYS = 90;

/**
 * Deprecation policy configuration
 */
export const DEPRECATION_POLICY = {
  minNoticeDays: MIN_DEPRECATION_NOTICE_DAYS,
  warningCode: 299,
  documentation: 'https://docs.propchain.io/api-deprecation',
  supportEmail: 'api-support@propchain.io',
  migrationGuide: 'https://docs.propchain.io/migration',
};

/**
 * Resolve the HTTP-date string for a Date, returning undefined if no date.
 */
export function toHttpDate(date?: Date): string | undefined {
  if (!date) return undefined;
  return date.toUTCString();
}

/**
 * Check whether a deprecated version's sunset date has passed.
 * If so, auto-transition status to 'sunset'.
 */
export function resolveEffectiveStatus(
  meta: ApiVersionMetadata,
): 'active' | 'deprecated' | 'sunset' {
  if (meta.status === 'active') return 'active';
  if (meta.sunsetDate && new Date() >= meta.sunsetDate) return 'sunset';
  return meta.status;
}

/**
 * Compute the days remaining before sunset (null if no sunset date).
 */
export function getSunsetCountdown(meta: ApiVersionMetadata): number | null {
  if (!meta.sunsetDate) return null;
  const diff = meta.sunsetDate.getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

/**
 * Get version metadata
 */
export function getVersionMetadata(version: ApiVersionEnum): ApiVersionMetadata | null {
  return API_VERSIONS[version] || null;
}

/**
 * Check if version is active (not deprecated or sunset)
 */
export function isVersionActive(version: ApiVersionEnum): boolean {
  const metadata = getVersionMetadata(version);
  return metadata?.status === 'active';
}

/**
 * Check if version is deprecated
 */
export function isVersionDeprecated(version: ApiVersionEnum): boolean {
  const metadata = getVersionMetadata(version);
  return metadata?.status === 'deprecated';
}

/**
 * Check if version is sunset (no longer supported)
 */
export function isVersionSunset(version: ApiVersionEnum): boolean {
  const metadata = getVersionMetadata(version);
  return metadata?.status === 'sunset';
}

/**
 * Get days until sunset for a deprecated version
 */
export function getDaysUntilSunset(version: ApiVersionEnum): number | null {
  const metadata = getVersionMetadata(version);
  if (!metadata?.sunsetDate) return null;

  const now = new Date();
  const daysUntil = Math.ceil(
    (metadata.sunsetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  );
  return daysUntil > 0 ? daysUntil : 0;
}
