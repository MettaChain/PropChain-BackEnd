import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { RATE_LIMIT_HEADERS } from '../rate-limit.config';

/**
 * Interceptor to add rate limit headers to response
 * Provides visibility into rate limit status
 */
@Injectable()
export class RateLimitHeadersInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    return next.handle().pipe(
      tap(() => {
        // Headers should already be set by the guard
        // This interceptor ensures they persist through the response
        const existingLimit = response.getHeader(RATE_LIMIT_HEADERS.LIMIT);
        if (!existingLimit) {
          // If no limit header was set, set defaults
          response.setHeader(RATE_LIMIT_HEADERS.LIMIT, '1000');
          response.setHeader(RATE_LIMIT_HEADERS.REMAINING, '999');
          response.setHeader(
            RATE_LIMIT_HEADERS.RESET,
            Math.floor((Date.now() + 15 * 60 * 1000) / 1000),
          );
        }
      }),
    );
  }
}
