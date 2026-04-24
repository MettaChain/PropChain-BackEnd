/**
 * Version Middleware
 * Handles API version parsing and validation for all requests
 */

import { Injectable, NestMiddleware, BadRequestException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import {
  ApiVersionEnum,
  SUPPORTED_API_VERSIONS,
  DEFAULT_API_VERSION,
  isVersionSunset,
} from './api-version.constants';

@Injectable()
export class VersionMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Extract version from request
    const version = this.extractVersion(req);

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

    // Store version in request object for use in controllers
    (req as any).apiVersion = version;

    next();
  }

  /**
   * Extract API version from multiple sources
   */
  private extractVersion(request: Request): ApiVersionEnum {
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
