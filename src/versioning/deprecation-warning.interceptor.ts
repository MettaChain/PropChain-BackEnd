// @ts-nocheck

/**
 * Deprecation Warning Interceptor
 * Adds deprecation headers to response for deprecated endpoints.
 *
 * Headers added per RFC 8594 / RFC 7234:
 *   - Deprecation: true
 *   - Sunset: <HTTP-date>            (RFC 8594 – date the version is removed)
 *   - Warning: 299 - "..."           (RFC 7234 – human-readable deprecation detail)
 *   - X-Deprecation-Message: ...     (proprietary, for quick debugging)
 *   - Link: <url>; rel="sunset"      (RFC 8594 – link to migration guide)
 *
 * A version is automatically moved to "sunset" status once its sunsetDate has
 * passed, returning 410 Gone to callers.
 *
 * Minimum 90-day deprecation notice is enforced via DEPRECATION_POLICY.
 */

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  GoneException,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Response } from 'express';
import { Reflector } from '@nestjs/core';
import { DEPRECATED_KEY, DEPRECATION_MESSAGE_KEY } from './api-version.decorator';
import { API_VERSION_KEY } from './api-version.decorator';
import {
  API_VERSIONS,
  DEPRECATION_POLICY,
  ApiVersionMetadata,
  toHttpDate,
  resolveEffectiveStatus,
  getSunsetCountdown,
} from './api-version.constants';

@Injectable()
export class DeprecationWarningInterceptor implements NestInterceptor {
  private readonly logger = new Logger(DeprecationWarningInterceptor.name);

  constructor(private reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse<Response>();
    const handler = context.getHandler();

    const isDeprecated = this.reflector.get<boolean>(DEPRECATED_KEY, handler);
    const deprecationMessage = this.reflector.get<string>(DEPRECATION_MESSAGE_KEY, handler);
    const apiVersion = this.reflector.get<string>(API_VERSION_KEY, handler);

    const versionMeta = apiVersion ? (API_VERSIONS as any)[apiVersion] : undefined;

    if (versionMeta) {
      const effective = resolveEffectiveStatus(versionMeta as ApiVersionMetadata);

      if (effective === 'sunset') {
        throw new GoneException({
          error: 'Gone',
          message: `API version ${apiVersion} has been sunset and is no longer available.`,
          sunset: toHttpDate((versionMeta as ApiVersionMetadata).sunsetDate),
          docs: (versionMeta as ApiVersionMetadata).documentation,
        });
      }

      if (effective === 'deprecated') {
        this.applyDeprecationHeaders(
          response,
          versionMeta as ApiVersionMetadata,
          deprecationMessage,
        );
      }
    } else if (isDeprecated) {
      this.applyDeprecationHeaders(response, undefined, deprecationMessage);
    }

    return next.handle().pipe(
      tap((data: any) => {
        if (
          (isDeprecated || versionMeta) &&
          typeof data === 'object' &&
          data !== null &&
          !Array.isArray(data)
        ) {
          data._deprecationInfo = this.buildDeprecationPayload(versionMeta, deprecationMessage);
        }
      }),
    );
  }

  private applyDeprecationHeaders(
    response: Response,
    meta: ApiVersionMetadata | undefined,
    endpointMessage?: string,
  ): void {
    response.setHeader('Deprecation', 'true');

    if (meta?.sunsetDate) {
      response.setHeader('Sunset', toHttpDate(meta.sunsetDate)!);
      const daysLeft = getSunsetCountdown(meta);
      if (daysLeft !== null) {
        response.setHeader('X-Sunset-Days-Remaining', String(daysLeft));
      }
    }

    const detail = endpointMessage || meta?.changesSummary || 'This endpoint is deprecated.';
    response.setHeader('Warning', `${DEPRECATION_POLICY.warningCode} - "${detail}"`);

    if (meta?.documentation) {
      response.setHeader('Link', `<${meta.documentation}>; rel="sunset"`);
    }

    response.setHeader(
      'X-Deprecation-Notice',
      `Minimum ${DEPRECATION_POLICY.minNoticeDays}-day deprecation window`,
    );
    response.setHeader('X-Migration-Guide', DEPRECATION_POLICY.migrationGuide);
  }

  private buildDeprecationPayload(
    meta: ApiVersionMetadata | undefined,
    endpointMessage?: string,
  ): Record<string, any> {
    const payload: Record<string, any> = {
      deprecated: true,
      message: endpointMessage || 'This endpoint is deprecated. Please migrate to a newer version.',
      migrationGuide: DEPRECATION_POLICY.migrationGuide,
    };

    if (meta) {
      payload.version = meta.version;
      payload.sunset = toHttpDate(meta.sunsetDate);
      payload.daysUntilSunset = getSunsetCountdown(meta);
      payload.documentation = meta.documentation;
    }

    return payload;
  }
}
