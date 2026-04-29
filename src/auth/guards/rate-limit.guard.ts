import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RateLimitService } from '../rate-limit.service';
import { RATE_LIMIT_HEADERS } from '../rate-limit.config';

export const RATE_LIMIT_SKIP_KEY = 'rate-limit-skip';
export const RATE_LIMIT_CUSTOM_KEY = 'rate-limit-custom';

/**
 * Decorator to skip rate limiting for a route
 */
export const SkipRateLimit = () => Reflect.metadata(RATE_LIMIT_SKIP_KEY, true);

/**
 * Decorator to apply custom rate limiting
 */
export const CustomRateLimit = (options: {
  windowMs?: number;
  max?: number;
  by?: 'user' | 'ip' | 'apiKey';
}) => Reflect.metadata(RATE_LIMIT_CUSTOM_KEY, options);

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @Inject(RateLimitService) private rateLimitService: RateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if rate limiting is skipped for this route
    const skip = this.reflector.getAllAndOverride<boolean>(RATE_LIMIT_SKIP_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (skip) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const endpoint = `${request.method} ${request.route?.path || request.url}`;

    try {
      // Check by user if authenticated
      if (request.user?.id) {
        const userTier = request.user.tier || 'free';
        const userStatus = await this.rateLimitService.checkUserRateLimit(
          request.user.id,
          userTier,
        );

        // Apply rate limit headers
        Object.entries(this.rateLimitService.getHeaders(userStatus)).forEach(([key, value]) => {
          response.setHeader(key, value);
        });

        if (userStatus.isExceeded) {
          throw new HttpException(
            {
              statusCode: HttpStatus.TOO_MANY_REQUESTS,
              message: `Rate limit exceeded. Max ${userStatus.limit} requests per 15 minutes.`,
              retryAfter: userStatus.retryAfter,
            },
            HttpStatus.TOO_MANY_REQUESTS,
            {
              cause: 'user_rate_limit_exceeded',
            },
          );
        }
      } else {
        // Check by IP for unauthenticated requests
        const ip = this.getClientIp(request);
        const ipStatus = await this.rateLimitService.checkIpRateLimit(ip);

        // Apply rate limit headers
        Object.entries(this.rateLimitService.getHeaders(ipStatus)).forEach(([key, value]) => {
          response.setHeader(key, value);
        });

        if (ipStatus.isExceeded) {
          throw new HttpException(
            {
              statusCode: HttpStatus.TOO_MANY_REQUESTS,
              message: 'Too many requests from your IP. Please try again later.',
              retryAfter: ipStatus.retryAfter,
            },
            HttpStatus.TOO_MANY_REQUESTS,
            {
              cause: 'ip_rate_limit_exceeded',
            },
          );
        }
      }

      // Check endpoint-specific limits
      const endpointStatus = await this.rateLimitService.checkEndpointRateLimit(endpoint);

      if (endpointStatus.limit > 0) {
        Object.entries(this.rateLimitService.getHeaders(endpointStatus)).forEach(([key, value]) => {
          response.setHeader(key, value);
        });

        if (endpointStatus.isExceeded) {
          throw new HttpException(
            {
              statusCode: HttpStatus.TOO_MANY_REQUESTS,
              message: `Too many requests to this endpoint. Please try again later.`,
              retryAfter: endpointStatus.retryAfter,
            },
            HttpStatus.TOO_MANY_REQUESTS,
            {
              cause: 'endpoint_rate_limit_exceeded',
            },
          );
        }
      }

      return true;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      // If rate limit check fails, allow the request
      console.error('Rate limit check error:', error);
      return true;
    }
  }

  /**
   * Extract client IP from request
   */
  private getClientIp(request: any): string {
    return (
      request.headers['x-forwarded-for']?.split(',')[0].trim() ||
      request.connection?.remoteAddress ||
      request.socket?.remoteAddress ||
      request.ip ||
      'unknown'
    );
  }
}
