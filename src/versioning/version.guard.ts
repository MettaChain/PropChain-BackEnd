/**
 * Version Guard
 * Validates that the requested version is supported before processing the request
 */

import { Injectable, CanActivate, ExecutionContext, BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiVersionEnum, SUPPORTED_API_VERSIONS, isVersionSunset } from './api-version.constants';
import { API_VERSION_KEY } from './api-version.decorator';

@Injectable()
export class VersionGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const currentVersion = (request as any).apiVersion as ApiVersionEnum;

    // Get supported versions for this endpoint from metadata
    const endpointVersions = this.reflector.get<ApiVersionEnum[]>(
      API_VERSION_KEY,
      context.getHandler(),
    );

    // If endpoint has version metadata, check if current version is supported
    if (endpointVersions && endpointVersions.length > 0) {
      if (!endpointVersions.includes(currentVersion)) {
        throw new BadRequestException(
          `This endpoint is not available in API version ${currentVersion}. Supported versions: ${endpointVersions.join(', ')}`,
        );
      }
    }

    // Check if version is sunset
    if (isVersionSunset(currentVersion)) {
      throw new BadRequestException(
        `API version ${currentVersion} is no longer supported and has been sunset.`,
      );
    }

    return true;
  }
}
