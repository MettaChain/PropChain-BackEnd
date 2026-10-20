import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RateLimitService } from '../../auth/rate-limit.service';

export const PROPERTIES_ROUTE_LIMIT_KEY = 'properties-route-limit';

export interface PropertiesRouteLimitOptions {
  /** Requests allowed per caller per window. */
  max: number;
  windowMs: number;
}

/** Limit one Property API route per caller. Apply after the JWT guard. */
export const PropertiesRouteLimit = (options: PropertiesRouteLimitOptions) =>
  SetMetadata(PROPERTIES_ROUTE_LIMIT_KEY, options);

/**
 * Per-caller rate limit for costly or abusable Property API routes. The caller is
 * the authenticated user id (falling back to the client address), and each route
 * has its own counter, so heavy use of one route does not consume another's budget.
 * Over the limit the response is `429` with `Retry-After`.
 */
@Injectable()
export class PropertiesRouteRateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimitService: RateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.get<PropertiesRouteLimitOptions | undefined>(
      PROPERTIES_ROUTE_LIMIT_KEY,
      context.getHandler(),
    );
    if (!options) return true;

    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const route = `${request.method} ${request.route?.path ?? request.url}`;
    const caller = String(request.authUser?.sub ?? request.user?.sub ?? request.ip ?? 'unknown');

    const status = await this.rateLimitService.checkScopedRateLimit(
      `properties-route:${route}`,
      caller,
      options.max,
      options.windowMs,
    );

    if (status.isExceeded) {
      if (status.retryAfter !== undefined) response.setHeader('Retry-After', String(status.retryAfter));
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many requests. Please try again later.',
          retryAfter: status.retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
