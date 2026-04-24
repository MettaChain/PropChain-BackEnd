/**
 * Version Header Interceptor
 * Adds version information to response headers and handles version-based responses
 */

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  BadRequestException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Response } from 'express';
import {
  ApiVersionEnum,
  getVersionMetadata,
  isVersionDeprecated,
  getDaysUntilSunset,
  isVersionSunset,
  SUPPORTED_API_VERSIONS,
  DEFAULT_API_VERSION,
} from './api-version.constants';

@Injectable()
export class VersionHeaderInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse<Response>();

    // Extract version from various sources
    const version = this.extractVersion(request);

    // Validate version
    if (!SUPPORTED_API_VERSIONS.includes(version)) {
      throw new BadRequestException(
        `API version "${version}" is not supported. Supported versions: ${SUPPORTED_API_VERSIONS.join(', ')}`,
      );
    }

    // Check if version is sunset
    if (isVersionSunset(version)) {
      throw new BadRequestException(
        `API version "${version}" is no longer supported and has been sunset.`,
      );
    }

    // Store version in request for later use
    (request as any).apiVersion = version;

    // Add version headers
    response.setHeader('API-Version', version);
    response.setHeader('API-Version-Status', getVersionMetadata(version)?.status || 'unknown');

    // Add deprecation headers if version is deprecated
    if (isVersionDeprecated(version)) {
      const daysUntil = getDaysUntilSunset(version);
      const sunsetDate = getVersionMetadata(version)?.sunsetDate?.toISOString();

      response.setHeader('Deprecation', 'true');
      response.setHeader(
        'Sunset',
        sunsetDate || new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString(),
      );
      response.setHeader(
        'Warning',
        `299 - "API version ${version} is deprecated and will be sunset in ${daysUntil} days"`,
      );
      response.setHeader(
        'X-API-Deprecation-Date',
        sunsetDate || new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString(),
      );
    }

    return next.handle().pipe(
      tap((data) => {
        // You can add additional processing here if needed
      }),
    );
  }

  /**
   * Extract API version from multiple sources in order of priority:
   * 1. URL path (e.g., /api/v1/users)
   * 2. API-Version header
   * 3. Accept header with version parameter
   * 4. Default version
   */
  private extractVersion(request: any): ApiVersionEnum {
    // 1. Check URL path
    const pathMatch = request.path.match(/\/api\/(v\d+)\//);
    if (pathMatch && pathMatch[1]) {
      const version = pathMatch[1] as ApiVersionEnum;
      if (SUPPORTED_API_VERSIONS.includes(version)) {
        return version;
      }
    }

    // 2. Check API-Version header
    const headerVersion = request.headers['api-version'] as ApiVersionEnum;
    if (headerVersion && SUPPORTED_API_VERSIONS.includes(headerVersion)) {
      return headerVersion;
    }

    // 3. Check Accept header for version
    const acceptHeader = request.headers['accept'] || '';
    const acceptMatch = acceptHeader.match(/version=([^;,\s]+)/);
    if (acceptMatch && acceptMatch[1]) {
      const version = acceptMatch[1] as ApiVersionEnum;
      if (SUPPORTED_API_VERSIONS.includes(version)) {
        return version;
      }
    }

    // 4. Return default version
    return DEFAULT_API_VERSION;
  }
}
