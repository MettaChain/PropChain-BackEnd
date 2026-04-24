/**
 * Rate Limiting Usage Examples
 * 
 * This file demonstrates how to use the rate limiting features
 * in the PropChain API
 */

import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import {
  RateLimited,
  StrictRateLimit,
  ModerateRateLimit,
  LooseRateLimit,
  NoRateLimit,
} from '../decorators/rate-limit.decorator';

@ApiTags('Examples - Rate Limiting')
@Controller('examples')
export class RateLimitExamplesController {
  /**
   * Example 1: Strict rate limiting (authentication)
   * - 5 requests per 15 minutes per user
   * - Perfect for login, register, password reset
   */
  @Post('strict-auth')
  @StrictRateLimit()
  @ApiOperation({
    summary: 'Example: Strict Rate Limited Endpoint',
    description: '5 requests per 15 minutes',
  })
  exampleStrictRateLimit() {
    return {
      message: 'This endpoint has strict rate limiting (5 req / 15 min)',
      example: 'POST /auth/login',
    };
  }

  /**
   * Example 2: Moderate rate limiting (standard operations)
   * - 100 requests per 1 minute per user
   * - Perfect for standard CRUD operations
   */
  @Get('moderate-crud')
  @ModerateRateLimit()
  @ApiOperation({
    summary: 'Example: Moderate Rate Limited Endpoint',
    description: '100 requests per minute',
  })
  exampleModerateRateLimit() {
    return {
      message: 'This endpoint has moderate rate limiting (100 req / min)',
      example: 'GET /properties, POST /users',
    };
  }

  /**
   * Example 3: Loose rate limiting (bulk operations)
   * - 300 requests per 1 minute per user
   * - Perfect for high-volume operations
   */
  @Get('loose-bulk')
  @LooseRateLimit()
  @ApiOperation({
    summary: 'Example: Loose Rate Limited Endpoint',
    description: '300 requests per minute',
  })
  exampleLooseRateLimit() {
    return {
      message: 'This endpoint has loose rate limiting (300 req / min)',
      example: 'Bulk operations, data exports',
    };
  }

  /**
   * Example 4: Default rate limiting (global)
   * - Applied automatically to all routes
   * - User-based or IP-based depending on authentication
   */
  @Get('default-limit')
  @RateLimited()
  @ApiOperation({
    summary: 'Example: Default Rate Limited Endpoint',
    description: 'Default global rate limiting applied',
  })
  exampleDefaultRateLimit() {
    return {
      message: 'This endpoint uses default rate limiting',
      limit: '1000 requests per 15 minutes (global)',
    };
  }

  /**
   * Example 5: Custom rate limiting
   * - Define specific window and max requests
   */
  @Get('custom-limit')
  @RateLimited({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 50, // 50 requests
    by: 'user',
  })
  @ApiOperation({
    summary: 'Example: Custom Rate Limited Endpoint',
    description: '50 requests per hour',
  })
  exampleCustomRateLimit() {
    return {
      message: 'This endpoint has custom rate limiting',
      limit: '50 requests per 1 hour',
    };
  }

  /**
   * Example 6: No rate limiting (admin operations)
   * - Exempt from rate limiting
   * - Use with caution, only for admin operations
   */
  @Get('no-limit')
  @NoRateLimit()
  @ApiOperation({
    summary: 'Example: No Rate Limiting',
    description: 'This endpoint is exempt from rate limiting',
  })
  exampleNoRateLimit() {
    return {
      message: 'This endpoint has no rate limiting',
      warning: 'Use @NoRateLimit() only for admin operations',
    };
  }

  /**
   * Example 7: Rate limiting with JWT guard
   * - Combine with authentication guards
   */
  @Post('protected-limited')
  @UseGuards(JwtAuthGuard)
  @ModerateRateLimit()
  @ApiOperation({
    summary: 'Example: Protected and Rate Limited Endpoint',
    description: 'Requires JWT token, 100 requests per minute',
  })
  exampleProtectedAndRateLimited() {
    return {
      message: 'This endpoint requires JWT and has rate limiting',
    };
  }
}

/**
 * RATE LIMIT HEADERS IN RESPONSES
 * 
 * All rate-limited endpoints include these headers:
 * 
 * X-RateLimit-Limit: 100          // Max requests allowed in window
 * X-RateLimit-Remaining: 99       // Requests remaining in window
 * X-RateLimit-Reset: 1703088000   // Unix timestamp when limit resets
 * 
 * On rate limit exceeded (429 response):
 * Retry-After: 45                 // Seconds to wait before retrying
 */

/**
 * RATE LIMIT STATUSES
 * 
 * 1. User-based rate limiting (authenticated requests)
 *    - Free tier: 100 req/hour, 10k req/month
 *    - Premium tier: 5000 req/hour, 500k req/month
 *    - Enterprise tier: 50k req/hour, unlimited/month
 *    - API Key: 10k req/hour, 1M req/month
 * 
 * 2. IP-based rate limiting (unauthenticated requests)
 *    - 1000 requests per 15 minutes per IP
 * 
 * 3. Endpoint-specific rate limiting
 *    - Authentication: 5 req/15 min
 *    - User creation: 10 req/hour
 *    - Property creation: 20 req/hour
 *    - Data retrieval: 100 req/minute
 */

/**
 * ERROR RESPONSE (429 Too Many Requests)
 * 
 * {
 *   "statusCode": 429,
 *   "message": "Rate limit exceeded. Max 100 requests per 15 minutes.",
 *   "retryAfter": 45,
 *   "timestamp": "2024-12-21T12:00:00Z",
 *   "path": "/api/v2/users"
 * }
 */

/**
 * ADMIN ENDPOINTS FOR RATE LIMIT MANAGEMENT
 * 
 * GET /admin/rate-limits/user/:userId        - Get user rate limit status
 * GET /admin/rate-limits/endpoint/:endpoint   - Get endpoint rate limit status
 * GET /admin/rate-limits/summary              - Get all rate limits summary
 * DELETE /admin/rate-limits/user/:userId/reset
 * DELETE /admin/rate-limits/ip/:ip/reset
 * DELETE /admin/rate-limits/endpoint/:endpoint/reset
 * DELETE /admin/rate-limits/api-key/:apiKey/reset
 */
