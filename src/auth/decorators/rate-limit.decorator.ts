import { applyDecorators, UseGuards } from '@nestjs/common';
import { RateLimitGuard, SkipRateLimit, CustomRateLimit } from '../guards/rate-limit.guard';

/**
 * Decorator to apply rate limiting to a route
 * Usage: @RateLimited() on controller methods
 */
export function RateLimited(options?: {
  windowMs?: number;
  max?: number;
  by?: 'user' | 'ip' | 'apiKey';
}) {
  if (options) {
    return applyDecorators(UseGuards(RateLimitGuard), CustomRateLimit(options));
  }
  return UseGuards(RateLimitGuard);
}

/**
 * Decorator to disable rate limiting for a route
 * Usage: @NoRateLimit() on controller methods
 */
export function NoRateLimit() {
  return SkipRateLimit();
}

/**
 * Decorator to enable strict rate limiting
 * Usage: @StrictRateLimit() on controller methods (auth endpoints)
 */
export function StrictRateLimit() {
  return applyDecorators(
    UseGuards(RateLimitGuard),
    CustomRateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 5, // 5 requests
      by: 'user',
    }),
  );
}

/**
 * Decorator to enable moderate rate limiting
 * Usage: @ModerateRateLimit() on controller methods
 */
export function ModerateRateLimit() {
  return applyDecorators(
    UseGuards(RateLimitGuard),
    CustomRateLimit({
      windowMs: 60 * 1000, // 1 minute
      max: 100, // 100 requests
      by: 'user',
    }),
  );
}

/**
 * Decorator to enable loose rate limiting
 * Usage: @LooseRateLimit() on controller methods
 */
export function LooseRateLimit() {
  return applyDecorators(
    UseGuards(RateLimitGuard),
    CustomRateLimit({
      windowMs: 60 * 1000, // 1 minute
      max: 300, // 300 requests
      by: 'user',
    }),
  );
}
