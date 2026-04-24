/**
 * Version Routing Service
 * Handles version-specific routing and request transformation
 */

import { Injectable } from '@nestjs/common';
import { ApiVersionEnum } from './api-version.constants';

export interface VersionedResponse<T = any> {
  apiVersion: ApiVersionEnum;
  data: T;
  timestamp: string;
}

@Injectable()
export class VersionRoutingService {
  /**
   * Wraps response with version metadata
   */
  versionedResponse<T>(data: T, version: ApiVersionEnum): VersionedResponse<T> {
    return {
      apiVersion: version,
      data,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Transforms data based on API version for backward compatibility
   * This allows returning different response shapes for different versions
   */
  transformDataByVersion<T>(data: T, fromVersion: ApiVersionEnum, toVersion: ApiVersionEnum): T {
    // Add version-specific transformations here
    // For example, if V1 expects different field names than V2

    if (fromVersion === ApiVersionEnum.V1 && toVersion === ApiVersionEnum.V2) {
      // Apply V1 to V2 transformations
      return this.transformV1ToV2(data);
    }

    if (fromVersion === ApiVersionEnum.V2 && toVersion === ApiVersionEnum.V1) {
      // Apply V2 to V1 transformations
      return this.transformV2ToV1(data);
    }

    return data;
  }

  /**
   * Transform data from V1 format to V2 format
   */
  private transformV1ToV2<T>(data: T): T {
    // Implement V1 -> V2 transformation logic
    return data;
  }

  /**
   * Transform data from V2 format to V1 format
   */
  private transformV2ToV1<T>(data: T): T {
    // Implement V2 -> V1 transformation logic
    return data;
  }

  /**
   * Get compatible versions for a given version
   */
  getCompatibleVersions(version: ApiVersionEnum): ApiVersionEnum[] {
    // Define which versions are compatible with each other
    const compatibility: Record<ApiVersionEnum, ApiVersionEnum[]> = {
      [ApiVersionEnum.V1]: [ApiVersionEnum.V1],
      [ApiVersionEnum.V2]: [ApiVersionEnum.V2, ApiVersionEnum.V1], // V2 can respond with V1 format
    };

    return compatibility[version] || [version];
  }
}
