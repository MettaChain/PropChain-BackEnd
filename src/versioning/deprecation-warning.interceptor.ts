/**
 * Deprecation Warning Interceptor
 * Adds deprecation warnings to response for deprecated endpoints
 */

import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Response } from 'express';
import { Reflector } from '@nestjs/core';
import { DEPRECATED_KEY, DEPRECATION_MESSAGE_KEY } from './api-version.decorator';

@Injectable()
export class DeprecationWarningInterceptor implements NestInterceptor {
  constructor(private reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse<Response>();
    const handler = context.getHandler();

    // Check if endpoint is marked as deprecated
    const isDeprecated = this.reflector.get<boolean>(DEPRECATED_KEY, handler);
    const deprecationMessage = this.reflector.get<string>(DEPRECATION_MESSAGE_KEY, handler);

    if (isDeprecated) {
      // Add deprecation headers
      response.setHeader('Deprecation', 'true');
      response.setHeader('Warning', '299 - "This endpoint is deprecated"');

      if (deprecationMessage) {
        response.setHeader('X-Deprecation-Message', deprecationMessage);
      }
    }

    return next.handle().pipe(
      tap((data: any) => {
        // If endpoint is deprecated and response is an object, add deprecation metadata
        if (isDeprecated && typeof data === 'object' && data !== null) {
          // Add deprecation info to response body (optional)
          if (!Array.isArray(data)) {
            data._deprecationInfo = {
              deprecated: true,
              message:
                deprecationMessage ||
                'This endpoint is deprecated. Please migrate to a newer version.',
            };
          }
        }
      }),
    );
  }
}
