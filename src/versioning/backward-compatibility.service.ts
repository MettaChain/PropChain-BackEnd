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
   * These transformers strip V2-specific fields to maintain V1 compatibility
   */
  private v2ToV1Transformers: Map<string, CompatibilityTransformer> = (() => {
    const map = new Map<string, CompatibilityTransformer>();
    
    // User endpoint - remove V2-specific fields
    map.set('user', (data: any) => {
      const v1User: any = {
        id: data.id,
        name: data.name,
        email: data.email,
      };
      // Include only fields that existed in V1
      if (data.role !== undefined) v1User.role = data.role;
      if (data.isActive !== undefined) v1User.isActive = data.isActive;
      // V1 doesn't include timestamps, trustScore, etc.
      return v1User;
    });
    
    // Property endpoint - remove V2-specific fields
    map.set('property', (data: any) => {
      const v1Property: any = {
        id: data.id,
        address: data.address,
        price: data.price,
      };
      // Include only fields that existed in V1
      if (data.title !== undefined) v1Property.title = data.title;
      if (data.description !== undefined) v1Property.description = data.description;
      if (data.propertyType !== undefined) v1Property.propertyType = data.propertyType;
      if (data.bedrooms !== undefined) v1Property.bedrooms = data.bedrooms;
      if (data.bathrooms !== undefined) v1Property.bathrooms = data.bathrooms;
      if (data.status !== undefined) v1Property.status = data.status;
      // V1 doesn't include createdAt, verified, and other V2-specific fields
      return v1Property;
    });
    
    // Transaction endpoint - remove V2-specific fields
    map.set('transaction', (data: any) => {
      const v1Transaction: any = {
        id: data.id,
        propertyId: data.propertyId,
        buyerId: data.buyerId,
        sellerId: data.sellerId,
        status: data.status,
        type: data.type,
      };
      // Include basic fields that existed in V1
      if (data.price !== undefined) v1Transaction.price = data.price;
      if (data.createdAt !== undefined) v1Transaction.createdAt = data.createdAt;
      // V1 doesn't include blockchain-specific fields, audit logs, etc.
      return v1Transaction;
    });
    
    // Auth response - remove V2-specific fields
    map.set('auth', (data: any) => {
      const v1Auth: any = {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        user: {
          id: data.user?.id,
          name: data.user?.name,
          email: data.user?.email,
        },
      };
      // V1 doesn't include token expiration, scopes, etc.
      return v1Auth;
    });
    
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
   * This is used to filter V2 responses to V1 format
   */
  fieldExistsInVersion(fieldName: string, version: ApiVersionEnum, entityType: string): boolean {
    // Define which fields exist in which versions
    const fieldVersions: Record<string, Record<string, ApiVersionEnum[]>> = {
      user: {
        // Fields in both V1 and V2
        id: [ApiVersionEnum.V1, ApiVersionEnum.V2],
        name: [ApiVersionEnum.V1, ApiVersionEnum.V2],
        email: [ApiVersionEnum.V1, ApiVersionEnum.V2],
        role: [ApiVersionEnum.V1, ApiVersionEnum.V2],
        isActive: [ApiVersionEnum.V1, ApiVersionEnum.V2],
        // V2-only fields
        createdAt: [ApiVersionEnum.V2],
        updatedAt: [ApiVersionEnum.V2],
        trustScore: [ApiVersionEnum.V2],
        emailVerified: [ApiVersionEnum.V2],
        lastLoginAt: [ApiVersionEnum.V2],
      },
      property: {
        // Fields in both V1 and V2
        id: [ApiVersionEnum.V1, ApiVersionEnum.V2],
        address: [ApiVersionEnum.V1, ApiVersionEnum.V2],
        price: [ApiVersionEnum.V1, ApiVersionEnum.V2],
        title: [ApiVersionEnum.V1, ApiVersionEnum.V2],
        description: [ApiVersionEnum.V1, ApiVersionEnum.V2],
        propertyType: [ApiVersionEnum.V1, ApiVersionEnum.V2],
        bedrooms: [ApiVersionEnum.V1, ApiVersionEnum.V2],
        bathrooms: [ApiVersionEnum.V1, ApiVersionEnum.V2],
        status: [ApiVersionEnum.V1, ApiVersionEnum.V2],
        // V2-only fields
        createdAt: [ApiVersionEnum.V2],
        updatedAt: [ApiVersionEnum.V2],
        verified: [ApiVersionEnum.V2],
        trustScore: [ApiVersionEnum.V2],
        squareFootage: [ApiVersionEnum.V2],
        yearBuilt: [ApiVersionEnum.V2],
        amenities: [ApiVersionEnum.V2],
      },
      transaction: {
        // Fields in both V1 and V2
        id: [ApiVersionEnum.V1, ApiVersionEnum.V2],
        propertyId: [ApiVersionEnum.V1, ApiVersionEnum.V2],
        buyerId: [ApiVersionEnum.V1, ApiVersionEnum.V2],
        sellerId: [ApiVersionEnum.V1, ApiVersionEnum.V2],
        status: [ApiVersionEnum.V1, ApiVersionEnum.V2],
        type: [ApiVersionEnum.V1, ApiVersionEnum.V2],
        price: [ApiVersionEnum.V1, ApiVersionEnum.V2],
        createdAt: [ApiVersionEnum.V1, ApiVersionEnum.V2],
        // V2-only fields
        blockchainHash: [ApiVersionEnum.V2],
        transactionHash: [ApiVersionEnum.V2],
        contractAddress: [ApiVersionEnum.V2],
        escrowStatus: [ApiVersionEnum.V2],
        auditLog: [ApiVersionEnum.V2],
        updatedAt: [ApiVersionEnum.V2],
      },
      auth: {
        // Fields in both V1 and V2
        accessToken: [ApiVersionEnum.V1, ApiVersionEnum.V2],
        refreshToken: [ApiVersionEnum.V1, ApiVersionEnum.V2],
        user: [ApiVersionEnum.V1, ApiVersionEnum.V2],
        // V2-only fields
        expiresIn: [ApiVersionEnum.V2],
        tokenType: [ApiVersionEnum.V2],
        scope: [ApiVersionEnum.V2],
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
