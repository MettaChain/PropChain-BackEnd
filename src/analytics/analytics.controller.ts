import {
  Controller,
  Get,
  Delete,
  Param,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../types/prisma.types';

@ApiTags('API Monitoring')
@ApiBearerAuth()
@Controller('analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  /**
   * Full monitoring dashboard — request counts, error rates,
   * slow endpoints, and usage by user.
   */
  @Get()
  @ApiOperation({
    summary: 'API monitoring dashboard',
    description:
      'Returns request counts, error rates, slow endpoints, and per-user usage for the given time window.',
  })
  @ApiQuery({
    name: 'window',
    required: false,
    description: 'Time window in minutes (default: 60)',
    example: 60,
  })
  @ApiResponse({ status: 200, description: 'Monitoring stats returned successfully' })
  getStats(@Query('window', new DefaultValuePipe(60), ParseIntPipe) window: number) {
    return this.analytics.getStats(window);
  }

  /**
   * Endpoint-level breakdown — sorted by request volume.
   */
  @Get('endpoints')
  @ApiOperation({
    summary: 'Per-endpoint stats',
    description: 'Request counts, error rates, and response time percentiles per endpoint.',
  })
  @ApiQuery({ name: 'window', required: false, description: 'Time window in minutes', example: 60 })
  @ApiResponse({ status: 200, description: 'Endpoint stats returned successfully' })
  getEndpoints(@Query('window', new DefaultValuePipe(60), ParseIntPipe) window: number) {
    return this.analytics.getEndpointStats(window);
  }

  /**
   * Slow endpoints — those exceeding the 1 s threshold.
   */
  @Get('slow-endpoints')
  @ApiOperation({
    summary: 'Slow endpoints',
    description: 'Endpoints with average response time above 1000 ms.',
  })
  @ApiQuery({ name: 'window', required: false, description: 'Time window in minutes', example: 60 })
  @ApiResponse({ status: 200, description: 'Slow endpoints returned successfully' })
  getSlowEndpoints(@Query('window', new DefaultValuePipe(60), ParseIntPipe) window: number) {
    return this.analytics.getStats(window).slowEndpoints;
  }

  /**
   * Error rate summary — broken down by HTTP status code.
   */
  @Get('errors')
  @ApiOperation({
    summary: 'Error rate breakdown',
    description: 'Error counts and rates grouped by HTTP status code.',
  })
  @ApiQuery({ name: 'window', required: false, description: 'Time window in minutes', example: 60 })
  @ApiResponse({ status: 200, description: 'Error stats returned successfully' })
  getErrors(@Query('window', new DefaultValuePipe(60), ParseIntPipe) window: number) {
    const stats = this.analytics.getStats(window);
    return {
      window: stats.window,
      totalRequests: stats.totalRequests,
      totalErrors: stats.totalErrors,
      overallErrorRate: stats.overallErrorRate,
      errorsByStatus: stats.errorsByStatus,
    };
  }

  /**
   * Top users by request volume.
   */
  @Get('users')
  @ApiOperation({
    summary: 'Usage by user',
    description: 'Top users ranked by request count with error counts and avg response time.',
  })
  @ApiQuery({ name: 'window', required: false, description: 'Time window in minutes', example: 60 })
  @ApiResponse({ status: 200, description: 'User usage stats returned successfully' })
  getUsers(@Query('window', new DefaultValuePipe(60), ParseIntPipe) window: number) {
    return this.analytics.getStats(window).topUsers;
  }

  /**
   * Stats for a specific user.
   */
  @Get('users/:userId')
  @ApiOperation({ summary: 'Usage stats for a specific user' })
  @ApiParam({ name: 'userId', description: 'User ID (UUID)' })
  @ApiQuery({ name: 'window', required: false, description: 'Time window in minutes', example: 60 })
  @ApiResponse({ status: 200, description: 'User stats returned' })
  @ApiResponse({ status: 404, description: 'No data for this user in the given window' })
  getUserStats(
    @Param('userId') userId: string,
    @Query('window', new DefaultValuePipe(60), ParseIntPipe) window: number,
  ) {
    const stats = this.analytics.getUserStats(userId, window);
    if (!stats) {
      return { message: 'No data for this user in the given window', userId, window: `${window}m` };
    }
    return stats;
  }

  /**
   * Reset all in-memory analytics data.
   */
  @Delete('reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset analytics data' })
  @ApiResponse({ status: 200, description: 'Analytics data cleared' })
  reset() {
    this.analytics.reset();
    return { message: 'Analytics reset' };
  }
}
