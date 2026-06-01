import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  Body,
  Response,
  Logger,
} from '@nestjs/common';
import { Response as ExpressResponse } from 'express';
import { PriceHistoryService } from './price-history.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PriceHistoryPermissionGuard } from './guards/price-history-permission.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUserPayload } from '../auth/types/auth-user.type';
import { GetPriceHistoryDto } from './dto/get-price-history.dto';
import { ChartDataDto } from './dto/chart-data.dto';
import { ExportDataDto } from './dto/export-data.dto';
import { BulkExportDto } from './dto/bulk-export.dto';

/**
 * PriceHistoryController
 * Handles HTTP requests for price history operations
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7
 */
@Controller('properties')
export class PriceHistoryController {
  private readonly logger = new Logger(PriceHistoryController.name);

  constructor(private readonly priceHistoryService: PriceHistoryService) {}

  /**
   * Get price history for a property with pagination and filtering
   * GET /api/properties/{propertyId}/price-history
   * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9
   *
   * @param propertyId - The property ID
   * @param query - Query parameters (limit, offset, startDate, endDate, sortBy, sortOrder)
   * @param user - Current authenticated user
   * @returns Paginated price history with metadata
   */
  @UseGuards(JwtAuthGuard, PriceHistoryPermissionGuard)
  @Get(':propertyId/price-history')
  async getPriceHistory(
    @Param('propertyId') propertyId: string,
    @Query() query: GetPriceHistoryDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    this.logger.log(
      `Retrieving price history for property ${propertyId} by user ${user.sub}`,
    );

    const { data, total } = await this.priceHistoryService.getPriceHistory(
      propertyId,
      query.limit,
      query.offset,
      query.startDate ? new Date(query.startDate) : undefined,
      query.endDate ? new Date(query.endDate) : undefined,
      query.sortBy,
      query.sortOrder,
    );

    return {
      data,
      pagination: {
        total,
        limit: query.limit,
        offset: query.offset,
        hasMore: query.offset + query.limit < total,
      },
    };
  }

  /**
   * Get chart data with time interval aggregation
   * GET /api/properties/{propertyId}/price-history/chart
   * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8
   *
   * @param propertyId - The property ID
   * @param query - Query parameters (interval, startDate, endDate)
   * @param user - Current authenticated user
   * @returns Chart data with aggregated price points
   */
  @UseGuards(JwtAuthGuard, PriceHistoryPermissionGuard)
  @Get(':propertyId/price-history/chart')
  async getChartData(
    @Param('propertyId') propertyId: string,
    @Query() query: ChartDataDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    this.logger.log(
      `Retrieving chart data for property ${propertyId} by user ${user.sub}`,
    );

    const chartData = await this.priceHistoryService.getChartData(
      propertyId,
      query.interval,
      query.startDate ? new Date(query.startDate) : undefined,
      query.endDate ? new Date(query.endDate) : undefined,
    );

    return chartData;
  }

  /**
   * Export price history as CSV or JSON
   * GET /api/properties/{propertyId}/price-history/export
   * Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7
   *
   * @param propertyId - The property ID
   * @param query - Query parameters (format, startDate, endDate)
   * @param user - Current authenticated user
   * @param response - Express response object
   */
  @UseGuards(JwtAuthGuard, PriceHistoryPermissionGuard)
  @Get(':propertyId/price-history/export')
  async exportPriceHistory(
    @Param('propertyId') propertyId: string,
    @Query() query: ExportDataDto,
    @CurrentUser() user: AuthUserPayload,
    @Response() response: ExpressResponse,
  ) {
    this.logger.log(
      `Exporting price history for property ${propertyId} as ${query.format} by user ${user.sub}`,
    );

    const buffer = await this.priceHistoryService.exportData(
      propertyId,
      query.format,
      query.startDate ? new Date(query.startDate) : undefined,
      query.endDate ? new Date(query.endDate) : undefined,
    );

    // Set appropriate MIME type and headers
    const mimeType = query.format === 'csv' ? 'text/csv' : 'application/json';
    const fileExtension = query.format === 'csv' ? 'csv' : 'json';
    const filename = `price-history-${propertyId}-${new Date().toISOString().split('T')[0]}.${fileExtension}`;

    response.setHeader('Content-Type', mimeType);
    response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    response.setHeader('Content-Length', buffer.length);

    response.send(buffer);
  }

  /**
   * Bulk export price history for multiple properties
   * POST /api/price-history/bulk-export
   * Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7
   *
   * @param body - Request body (propertyIds, format, startDate, endDate)
   * @param user - Current authenticated user
   * @param response - Express response object
   */
  @UseGuards(JwtAuthGuard)
  @Post('bulk-export')
  async bulkExport(
    @Body() body: BulkExportDto,
    @CurrentUser() user: AuthUserPayload,
    @Response() response: ExpressResponse,
  ) {
    this.logger.log(
      `Bulk exporting price history for ${body.propertyIds.length} properties as ${body.format} by user ${user.sub}`,
    );

    const buffer = await this.priceHistoryService.bulkExport(
      body.propertyIds,
      user.sub,
      user.role,
      body.format,
      body.startDate ? new Date(body.startDate) : undefined,
      body.endDate ? new Date(body.endDate) : undefined,
    );

    // Set appropriate MIME type and headers
    const mimeType = body.format === 'csv' ? 'text/csv' : 'application/json';
    const fileExtension = body.format === 'csv' ? 'csv' : 'json';
    const filename = `bulk-price-history-${new Date().toISOString().split('T')[0]}.${fileExtension}`;

    response.setHeader('Content-Type', mimeType);
    response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    response.setHeader('Content-Length', buffer.length);

    response.send(buffer);
  }
}
