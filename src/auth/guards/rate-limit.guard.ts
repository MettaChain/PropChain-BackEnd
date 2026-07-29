// @ts-nocheck

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RateLimitService } from '../rate-limit.service';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  private readonly logger = new Logger(RateLimitGuard.name);

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
      // Check by user if authenticated. Auth guards (JwtAuthGuard, ApiKeyAuthGuard)
      // attach the authenticated payload as `request.authUser`, keyed by `sub`.
      const ip = this.getClientIp(request);
      const authUser = request.authUser;

      if (authUser?.sub) {
        // API keys get their own dedicated bucket regardless of the owning user's
        // tier; JWT-authenticated requests use the user's real tier from the DB.
        const userTier =
          authUser.type === 'api-key' ? 'apiKey' : (authUser.tier || 'FREE').toLowerCase();

        const [userStatus, userIpStatus] = await Promise.all([
          this.rateLimitService.checkUserRateLimit(authUser.sub, userTier),
          this.rateLimitService.checkUserIpRateLimit(authUser.sub, ip),
        ]);

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
            { cause: 'user_rate_limit_exceeded' },
          );
        }

        if (userIpStatus.isExceeded) {
          throw new HttpException(
            {
              statusCode: HttpStatus.TOO_MANY_REQUESTS,
              message: 'Too many requests from this account on this IP. Please try again later.',
              retryAfter: userIpStatus.retryAfter,
            },
            HttpStatus.TOO_MANY_REQUESTS,
            { cause: 'user_ip_rate_limit_exceeded' },
          );
        }
      } else {
        const ipStatus = await this.rateLimitService.checkIpRateLimit(ip);

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
            { cause: 'ip_rate_limit_exceeded' },
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
      this.logger.error(
        'Rate limit check error',
        error instanceof Error ? error.stack : String(error),
      );
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
