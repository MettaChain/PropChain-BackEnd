/**
 * Backward Compatibility Service
 * Handles transformation of data between API versions for backward compatibility
 */

import { Injectable } from '@nestjs/common';
import { ApiVersionEnum } from './api-version.constants';

export type CompatibilityTransformer = (data: any) => any;

@Injectable()
export class BackwardCompatibilityService {
  /**
   * Transformers that convert V2 response format to V1 format
   */
  private v2ToV1Transformers: Map<string, CompatibilityTransformer> = (() => {
    const map = new Map<string, CompatibilityTransformer>();
    // Example: User endpoint
    map.set('user', (data: any) => ({
      id: data.id,
      name: data.name,
      email: data.email,
      // V1 doesn't include timestamps
    }));
    // Example: Property endpoint
    map.set('property', (data: any) => ({
      id: data.id,
      address: data.address,
      price: data.price,
      // V1 doesn't include new V2 fields
    }));
    return map;
  })();

  /**
   * Transformers that convert V1 response format to V2 format
   */
  private v1ToV2Transformers: Map<string, CompatibilityTransformer> = (() => {
    const map = new Map<string, CompatibilityTransformer>();
    // Example: User endpoint
    map.set('user', (data: any) => ({
      ...data,
      createdAt: data.createdAt || new Date().toISOString(),
      updatedAt: data.updatedAt || new Date().toISOString(),
      // Add V2-specific fields
    }));
    return map;
  })();

  /**
   * Transform data from source version to target version
   */
  transform<T = any>(
    data: T,
    fromVersion: ApiVersionEnum,
    toVersion: ApiVersionEnum,
    entityType: string,
  ): T {
    if (fromVersion === toVersion) {
      return data;
    }

    if (fromVersion === ApiVersionEnum.V2 && toVersion === ApiVersionEnum.V1) {
      return this.transformV2ToV1(data, entityType);
    }

    if (fromVersion === ApiVersionEnum.V1 && toVersion === ApiVersionEnum.V2) {
      return this.transformV1ToV2(data, entityType);
    }

    return data;
  }

  /**
   * Transform from V2 to V1
   */
  private transformV2ToV1<T = any>(data: T, entityType: string): T {
    if (Array.isArray(data)) {
      return data.map((item) => this.transformV2ToV1(item, entityType)) as T;
    }

    const transformer = this.v2ToV1Transformers.get(entityType);
    if (transformer && typeof data === 'object' && data !== null) {
      return transformer(data) as T;
    }

    return data;
  }

  /**
   * Transform from V1 to V2
   */
  private transformV1ToV2<T = any>(data: T, entityType: string): T {
    if (Array.isArray(data)) {
      return data.map((item) => this.transformV1ToV2(item, entityType)) as T;
    }

    const transformer = this.v1ToV2Transformers.get(entityType);
    if (transformer && typeof data === 'object' && data !== null) {
      return transformer(data) as T;
    }

    return data;
  }

  /**
   * Register a custom transformer for V2 to V1 conversion
   */
  registerV2ToV1Transformer(entityType: string, transformer: CompatibilityTransformer): void {
    this.v2ToV1Transformers.set(entityType, transformer);
  }

  /**
   * Register a custom transformer for V1 to V2 conversion
   */
  registerV1ToV2Transformer(entityType: string, transformer: CompatibilityTransformer): void {
    this.v1ToV2Transformers.set(entityType, transformer);
  }

  /**
   * Check if a field exists in a specific version
   */
  fieldExistsInVersion(fieldName: string, version: ApiVersionEnum, entityType: string): boolean {
    // Define which fields exist in which versions
    const fieldVersions: Record<string, Record<string, ApiVersionEnum[]>> = {
      user: {
        id: [ApiVersionEnum.V1, ApiVersionEnum.V2],
        name: [ApiVersionEnum.V1, ApiVersionEnum.V2],
        email: [ApiVersionEnum.V1, ApiVersionEnum.V2],
        createdAt: [ApiVersionEnum.V2],
        updatedAt: [ApiVersionEnum.V2],
        trustScore: [ApiVersionEnum.V2],
      },
      property: {
        id: [ApiVersionEnum.V1, ApiVersionEnum.V2],
        address: [ApiVersionEnum.V1, ApiVersionEnum.V2],
        price: [ApiVersionEnum.V1, ApiVersionEnum.V2],
        createdAt: [ApiVersionEnum.V2],
        verified: [ApiVersionEnum.V2],
      },
    };

    const entityFields = fieldVersions[entityType] || {};
    const versionsWithField = entityFields[fieldName] || [];

    return versionsWithField.includes(version);
  }

  /**
   * Filter object to include only fields available in a specific version
   */
  filterFieldsByVersion<T extends Record<string, any>>(
    obj: T,
    version: ApiVersionEnum,
    entityType: string,
  ): Partial<T> {
    const filtered: any = {};

    for (const [key, value] of Object.entries(obj)) {
      if (this.fieldExistsInVersion(key, version, entityType)) {
        filtered[key] = value;
      }
    }

    return filtered;
  }
}
