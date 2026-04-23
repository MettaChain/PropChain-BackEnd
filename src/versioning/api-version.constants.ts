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
