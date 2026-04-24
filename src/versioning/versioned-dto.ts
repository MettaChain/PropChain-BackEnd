/**
 * Versioned DTO Base Classes
 * Provides base classes for creating version-aware DTOs
 */

import { ApiVersionEnum } from './api-version.constants';

/**
 * Base class for versioned DTOs
 */
export abstract class VersionedDto {
  /**
   * API version this DTO is for
   */
  apiVersion?: ApiVersionEnum;

  /**
   * Timestamp when DTO was created
   */
  timestamp?: Date;
}

/**
 * Response wrapper for versioned responses
 */
export class VersionedResponse<T = any> {
  /**
   * The API version being used
   */
  apiVersion: ApiVersionEnum;

  /**
   * The actual response data
   */
  data: T;

  /**
   * Response timestamp
   */
  timestamp: Date;

  /**
   * Optional deprecation information
   */
  deprecation?: {
    deprecated: boolean;
    message?: string;
    sunsetDate?: Date;
  };

  constructor(data: T, version: ApiVersionEnum, deprecation?: any) {
    this.data = data;
    this.apiVersion = version;
    this.timestamp = new Date();
    this.deprecation = deprecation;
  }
}

/**
 * Error response for versioning errors
 */
export class VersioningError {
  statusCode: number;
  message: string;
  error: string;
  version?: ApiVersionEnum;
  supportedVersions?: ApiVersionEnum[];
  timestamp: Date;

  constructor(
    statusCode: number,
    message: string,
    error: string,
    version?: ApiVersionEnum,
    supportedVersions?: ApiVersionEnum[],
  ) {
    this.statusCode = statusCode;
    this.message = message;
    this.error = error;
    this.version = version;
    this.supportedVersions = supportedVersions;
    this.timestamp = new Date();
  }
}

/**
 * Pagination DTO with version support
 */
export class VersionedPaginationDto<T = any> extends VersionedResponse<T[]> {
  page: number;
  limit: number;
  total: number;
  totalPages: number;

  constructor(data: T[], version: ApiVersionEnum, page: number, limit: number, total: number) {
    super(data, version);
    this.page = page;
    this.limit = limit;
    this.total = total;
    this.totalPages = Math.ceil(total / limit);
  }
}

/**
 * Meta information for versioned responses
 */
export interface VersionMetaInfo {
  version: ApiVersionEnum;
  status: 'active' | 'deprecated' | 'sunset';
  releasedAt: Date;
  sunsetAt?: Date;
  deprecatedAt?: Date;
}
