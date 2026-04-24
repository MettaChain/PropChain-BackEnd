import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Body,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { RateLimitService, RateLimitStatus } from '../rate-limit.service';
import { SkipRateLimit } from '../guards/rate-limit.guard';

@ApiTags('Admin - Rate Limiting')
@Controller('admin/rate-limits')
@ApiBearerAuth('JWT')
export class RateLimitAdminController {
  constructor(private rateLimitService: RateLimitService) {}

  @Get('user/:userId')
  @ApiOperation({
    summary: 'Get rate limit status for a user',
    description: 'Retrieve current rate limit status and remaining requests for a user',
  })
  @ApiResponse({
    status: 200,
    description: 'Rate limit status retrieved successfully',
    schema: {
      example: {
        user: {
          limit: 5000,
          remaining: 4999,
          reset: 1703088000,
          isExceeded: false,
        },
        reset: '2024-12-21T00:00:00Z',
      },
    },
  })
  async getUserRateLimitStatus(
    @Param('userId') userId: string,
  ): Promise<any> {
    return this.rateLimitService.getUserRateLimitStats(userId);
  }

  @Get('endpoint/:endpoint')
  @SkipRateLimit()
  @ApiOperation({
    summary: 'Get rate limit status for an endpoint',
    description: 'Retrieve current rate limit status for a specific endpoint',
  })
  @ApiResponse({
    status: 200,
    description: 'Endpoint rate limit status retrieved successfully',
  })
  async getEndpointRateLimitStatus(
    @Param('endpoint') endpoint: string,
  ): Promise<RateLimitStatus> {
    return this.rateLimitService.checkEndpointRateLimit(endpoint);
  }

  @Delete('user/:userId/reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Reset rate limit for a user',
    description: 'Reset rate limit counter for a specific user',
  })
  @ApiResponse({
    status: 204,
    description: 'Rate limit reset successfully',
  })
  async resetUserRateLimit(@Param('userId') userId: string): Promise<void> {
    return this.rateLimitService.resetUserRateLimit(userId);
  }

  @Delete('ip/:ip/reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Reset rate limit for an IP',
    description: 'Reset rate limit counter for a specific IP address',
  })
  @ApiResponse({
    status: 204,
    description: 'IP rate limit reset successfully',
  })
  async resetIpRateLimit(@Param('ip') ip: string): Promise<void> {
    return this.rateLimitService.resetIpRateLimit(ip);
  }

  @Delete('endpoint/:endpoint/reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  @SkipRateLimit()
  @ApiOperation({
    summary: 'Reset rate limit for an endpoint',
    description: 'Reset rate limit counter for a specific endpoint',
  })
  @ApiResponse({
    status: 204,
    description: 'Endpoint rate limit reset successfully',
  })
  async resetEndpointRateLimit(
    @Param('endpoint') endpoint: string,
  ): Promise<void> {
    return this.rateLimitService.resetEndpointRateLimit(endpoint);
  }

  @Delete('api-key/:apiKey/reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Reset rate limit for an API key',
    description: 'Reset rate limit counter for a specific API key',
  })
  @ApiResponse({
    status: 204,
    description: 'API key rate limit reset successfully',
  })
  async resetApiKeyRateLimit(@Param('apiKey') apiKey: string): Promise<void> {
    return this.rateLimitService.resetApiKeyRateLimit(apiKey);
  }

  @Get('summary')
  @SkipRateLimit()
  @ApiOperation({
    summary: 'Get rate limiting summary',
    description:
      'Retrieve information about all configured rate limits and their current status',
  })
  @ApiResponse({
    status: 200,
    description: 'Rate limit summary retrieved successfully',
    schema: {
      example: {
        globalLimit: 1000,
        globalWindow: '15 minutes',
        userTiers: {
          free: '100 req/hour',
          premium: '5000 req/hour',
          enterprise: 'unlimited',
        },
        endpointLimits: {
          'POST /auth/login': '5 req/15 minutes',
          'POST /auth/register': '5 req/hour',
          'GET /properties': '100 req/minute',
        },
      },
    },
  })
  async getRateLimitSummary(): Promise<any> {
    return {
      globalLimit: 1000,
      globalWindow: '15 minutes',
      globalWindowMs: 15 * 60 * 1000,
      userTiers: {
        free: {
          hourlyLimit: 100,
          monthlyLimit: 10000,
        },
        premium: {
          hourlyLimit: 5000,
          monthlyLimit: 500000,
        },
        enterprise: {
          hourlyLimit: 50000,
          monthlyLimit: 'unlimited',
        },
        apiKey: {
          hourlyLimit: 10000,
          monthlyLimit: 1000000,
        },
      },
      strictEndpoints: {
        'POST /auth/register': '5 requests per 1 hour',
        'POST /auth/login': '5 requests per 15 minutes',
        'POST /auth/request-password-reset': '3 requests per 1 hour',
      },
      moderateEndpoints: {
        'POST /users': '10 requests per hour',
        'POST /properties': '20 requests per hour',
        'GET /users': '100 requests per minute',
        'GET /properties': '100 requests per minute',
      },
      description:
        'Authentication and sensitive endpoints have strict limits. Standard endpoints have moderate limits. Unauthenticated requests are limited by IP.',
    };
  }
}
