import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CacheService } from '../cache/cache.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PriceHistory, UserRole, PropertyStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * PriceHistoryService
 * Manages price history recording, retrieval, and analysis
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 2.2, 2.3, 2.4, 2.5, 3.2, 3.3, 3.4, 3.7, 5.1, 5.2, 5.3, 5.4, 6.1, 6.2, 6.3, 6.4
 */
@Injectable()
export class PriceHistoryService {
  private readonly logger = new Logger(PriceHistoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Record a price change with complete audit information
   * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 3.2, 6.1, 6.2, 6.3
   *
   * @param propertyId - The property ID
   * @param previousPrice - The previous price
   * @param newPrice - The new price
   * @param userId - The user ID who made the change
   * @param userRole - The user's role
   * @param changeReason - Optional reason for the change
   * @param metadata - Optional metadata
   * @param ipAddress - Optional IP address
   * @param userAgent - Optional user agent
   * @returns The created PriceHistory record
   */
  async recordPriceChange(
    propertyId: string,
    previousPrice: Decimal | number,
    newPrice: Decimal | number,
    userId: string,
    userRole: UserRole,
    changeReason?: string,
    metadata?: Record<string, any>,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<PriceHistory> {
    // Validate new price is positive decimal (> 0)
    const newPriceDecimal = new Decimal(newPrice);
    if (newPriceDecimal.lessThanOrEqualTo(0)) {
      throw new BadRequestException('New price must be greater than 0');
    }

    // Validate previous price is positive decimal (> 0)
    const previousPriceDecimal = new Decimal(previousPrice);
    if (previousPriceDecimal.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Previous price must be greater than 0');
    }

    // Verify property exists
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
    });

    if (!property) {
      throw new NotFoundException(`Property with ID ${propertyId} not found`);
    }

    // Validate previous price matches last recorded price or is initial price
    const lastRecord = await this.prisma.priceHistory.findFirst({
      where: { propertyId },
      orderBy: { timestamp: 'desc' },
    });

    if (lastRecord) {
      // If there's a previous record, the previousPrice should match its newPrice
      if (!lastRecord.newPrice.equals(previousPriceDecimal)) {
        throw new BadRequestException(
          `Previous price ${previousPrice} does not match the last recorded price ${lastRecord.newPrice}`,
        );
      }
    }

    // Calculate percentage change
    const percentageChange = this.calculatePercentageChange(previousPriceDecimal, newPriceDecimal);

    // Create PriceHistory record with all audit information
    const priceHistory = await this.prisma.priceHistory.create({
      data: {
        propertyId,
        previousPrice: previousPriceDecimal,
        newPrice: newPriceDecimal,
        priceChangePercentage: percentageChange,
        userId,
        userRole,
        changeReason,
        ipAddress,
        userAgent,
        metadata: metadata || {},
      },
    });

    // Update property's current price atomically (within same transaction)
    await this.prisma.property.update({
      where: { id: propertyId },
      data: { price: newPriceDecimal },
    });

    // Invalidate cache for this property
    await this.cacheService.invalidatePropertyCache(propertyId);

    // Trigger notification event
    try {
      const percentageChangeStr = percentageChange ? percentageChange.toString() : '0.00';
      await this.notificationsService.sendNotification(
        userId,
        'Price Change Recorded',
        `Property price updated from ${previousPrice} to ${newPrice} (${percentageChangeStr}% change)`,
        'PRICE_CHANGE',
        {
          propertyId,
          previousPrice: previousPrice.toString(),
          newPrice: newPrice.toString(),
          percentageChange: percentageChangeStr,
          changeReason,
        },
      );
    } catch (error) {
      this.logger.error(`Failed to send price change notification: ${error}`);
      // Don't throw - notification failure shouldn't block price recording
    }

    this.logger.log(
      `Price change recorded for property ${propertyId}: ${previousPrice} -> ${newPrice}`,
    );

    return priceHistory;
  }

  /**
   * Calculate percentage change between two prices
   * Validates: Requirements 3.2, 3.3, 3.4, 3.7
   *
   * @param previousPrice - The previous price
   * @param newPrice - The new price
   * @returns The percentage change rounded to 2 decimal places, or null if previousPrice is zero/null
   */
  calculatePercentageChange(
    previousPrice: Decimal | number | null,
    newPrice: Decimal | number,
  ): Decimal | null {
    // Handle edge case: previousPrice is zero or null (return null)
    if (!previousPrice || new Decimal(previousPrice).equals(0)) {
      return null;
    }

    const prevDecimal = new Decimal(previousPrice);
    const newDecimal = new Decimal(newPrice);

    // Calculate percentage change using formula: ((newPrice - previousPrice) / previousPrice) * 100
    const percentageChange = newDecimal
      .minus(prevDecimal)
      .dividedBy(prevDecimal)
      .times(100);

    // Round result to 2 decimal places
    return percentageChange.toDecimalPlaces(2);
  }

  /**
   * Get price history for a property with pagination and filtering
   * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 6.4
   *
   * @param propertyId - The property ID
   * @param limit - Number of records per page
   * @param offset - Number of records to skip
   * @param startDate - Optional start date for filtering
   * @param endDate - Optional end date for filtering
   * @param sortBy - Field to sort by (timestamp, price, percentage_change)
   * @param sortOrder - Sort order (ASC or DESC)
   * @returns Object with data array and total count
   */
  async getPriceHistory(
    propertyId: string,
    limit: number = 50,
    offset: number = 0,
    startDate?: Date,
    endDate?: Date,
    sortBy: string = 'timestamp',
    sortOrder: 'ASC' | 'DESC' = 'DESC',
  ): Promise<{ data: PriceHistory[]; total: number }> {
    // Verify property exists
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
    });

    if (!property) {
      throw new NotFoundException(`Property with ID ${propertyId} not found`);
    }

    // Build where clause with date range filtering
    const where: any = { propertyId };

    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) {
        where.timestamp.gte = startDate;
      }
      if (endDate) {
        where.timestamp.lte = endDate;
      }
    }

    // Map sortBy field to database column
    let orderByField = 'timestamp';
    if (sortBy === 'price') {
      orderByField = 'newPrice';
    } else if (sortBy === 'percentage_change') {
      orderByField = 'priceChangePercentage';
    }

    // Query PriceHistory records with pagination and sorting
    const [data, total] = await Promise.all([
      this.prisma.priceHistory.findMany({
        where,
        orderBy: { [orderByField]: sortOrder },
        take: limit,
        skip: offset,
      }),
      this.prisma.priceHistory.count({ where }),
    ]);

    return { data, total };
  }

  /**
   * Check if user has permission to view price history for a property
   * Validates: Requirements 5.1, 5.2, 5.3, 5.4
   *
   * @param userId - The user ID
   * @param userRole - The user's role
   * @param propertyId - The property ID
   * @returns True if user has permission, false otherwise
   */
  async checkPermission(userId: string, userRole: UserRole, propertyId: string): Promise<boolean> {
    // Grant access if user.role === ADMIN
    if (userRole === UserRole.ADMIN) {
      return true;
    }

    // Get property to check ownership and status
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
    });

    if (!property) {
      return false;
    }

    // Grant access if user.id === property.ownerId
    if (userId === property.ownerId) {
      return true;
    }

    // Grant access if property.status === ACTIVE (public property)
    if (property.status === PropertyStatus.ACTIVE) {
      return true;
    }

    // Deny access otherwise
    return false;
  }

  /**
   * Get chart data with time interval aggregation
   * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7
   *
   * @param propertyId - The property ID
   * @param interval - Time interval for aggregation (daily, weekly, monthly, yearly)
   * @param startDate - Optional start date for filtering
   * @param endDate - Optional end date for filtering
   * @returns Chart data with aggregated price points
   */
  async getChartData(
    propertyId: string,
    interval: 'daily' | 'weekly' | 'monthly' | 'yearly' = 'daily',
    startDate?: Date,
    endDate?: Date,
  ): Promise<any> {
    // Verify property exists
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true, address: true, price: true },
    });

    if (!property) {
      throw new NotFoundException(`Property with ID ${propertyId} not found`);
    }

    // Build where clause with date range filtering
    const where: any = { propertyId };

    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) {
        where.timestamp.gte = startDate;
      }
      if (endDate) {
        where.timestamp.lte = endDate;
      }
    }

    // Query all price history records in date range
    const records = await this.prisma.priceHistory.findMany({
      where,
      orderBy: { timestamp: 'asc' },
    });

    // If no records, return empty data points
    if (records.length === 0) {
      return {
        propertyId,
        propertyAddress: property.address,
        currentPrice: property.price,
        dateRange: {
          start: startDate || new Date(0),
          end: endDate || new Date(),
        },
        aggregationInterval: interval,
        dataPoints: [],
      };
    }

    // Group records by time interval
    const groupedData = this.groupByTimeInterval(records, interval);

    // Calculate aggregated values for each interval
    const dataPoints = Array.from(groupedData.entries()).map(([intervalKey, intervalRecords]) => {
      const prices = intervalRecords.map((r) => new Decimal(r.newPrice));
      const minPrice = prices.reduce((min, p) => (p.lessThan(min) ? p : min), prices[0]);
      const maxPrice = prices.reduce((max, p) => (p.greaterThan(max) ? p : max), prices[0]);
      const firstRecord = intervalRecords[0];
      const lastRecord = intervalRecords[intervalRecords.length - 1];

      return {
        timestamp: new Date(intervalKey),
        price: lastRecord.newPrice,
        previousPrice: firstRecord.previousPrice,
        priceChangePercentage: lastRecord.priceChangePercentage,
        changeReason: lastRecord.changeReason,
        minPrice,
        maxPrice,
        firstPrice: firstRecord.newPrice,
        lastPrice: lastRecord.newPrice,
      };
    });

    // Determine date range from records
    const actualStartDate = records[0].timestamp;
    const actualEndDate = records[records.length - 1].timestamp;

    return {
      propertyId,
      propertyAddress: property.address,
      currentPrice: property.price,
      dateRange: {
        start: actualStartDate,
        end: actualEndDate,
      },
      aggregationInterval: interval,
      dataPoints,
    };
  }

  /**
   * Group price history records by time interval
   * Helper method for getChartData
   *
   * @param records - Array of price history records
   * @param interval - Time interval (daily, weekly, monthly, yearly)
   * @returns Map of interval keys to records
   */
  private groupByTimeInterval(
    records: PriceHistory[],
    interval: 'daily' | 'weekly' | 'monthly' | 'yearly',
  ): Map<string, PriceHistory[]> {
    const grouped = new Map<string, PriceHistory[]>();

    records.forEach((record) => {
      const date = new Date(record.timestamp);
      let intervalKey: string;

      switch (interval) {
        case 'daily':
          intervalKey = date.toISOString().split('T')[0]; // YYYY-MM-DD
          break;
        case 'weekly':
          // Get the start of the week (Monday)
          const weekStart = new Date(date);
          const day = weekStart.getDay();
          const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1);
          weekStart.setDate(diff);
          intervalKey = weekStart.toISOString().split('T')[0];
          break;
        case 'monthly':
          intervalKey = date.toISOString().substring(0, 7); // YYYY-MM
          break;
        case 'yearly':
          intervalKey = date.getFullYear().toString(); // YYYY
          break;
      }

      if (!grouped.has(intervalKey)) {
        grouped.set(intervalKey, []);
      }
      grouped.get(intervalKey)!.push(record);
    });

    return grouped;
  }

  /**
   * Export price history data in CSV or JSON format
   * Validates: Requirements 8.1, 8.2, 8.3, 8.6, 8.7
   *
   * @param propertyId - The property ID
   * @param format - Export format (csv or json)
   * @param startDate - Optional start date for filtering
   * @param endDate - Optional end date for filtering
   * @returns Buffer with exported data
   */
  async exportData(
    propertyId: string,
    format: 'csv' | 'json' = 'json',
    startDate?: Date,
    endDate?: Date,
  ): Promise<Buffer> {
    // Verify property exists
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true, address: true },
    });

    if (!property) {
      throw new NotFoundException(`Property with ID ${propertyId} not found`);
    }

    // Build where clause with date range filtering
    const where: any = { propertyId };

    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) {
        where.timestamp.gte = startDate;
      }
      if (endDate) {
        where.timestamp.lte = endDate;
      }
    }

    // Query price history records
    const records = await this.prisma.priceHistory.findMany({
      where,
      orderBy: { timestamp: 'asc' },
    });

    if (format === 'csv') {
      return this.formatAsCSV(records, property.address);
    } else {
      return this.formatAsJSON(records, property.address);
    }
  }

  /**
   * Format price history records as CSV
   * Helper method for exportData
   *
   * @param records - Array of price history records
   * @param propertyAddress - Property address for metadata
   * @returns Buffer with CSV data
   */
  private formatAsCSV(records: PriceHistory[], propertyAddress: string): Buffer {
    const headers = [
      'Timestamp',
      'Previous Price',
      'New Price',
      'Price Change Percentage',
      'User ID',
      'User Role',
      'Change Reason',
      'IP Address',
      'User Agent',
      'Metadata',
    ];

    const rows = records.map((record) => [
      record.timestamp.toISOString(),
      record.previousPrice.toString(),
      record.newPrice.toString(),
      record.priceChangePercentage ? record.priceChangePercentage.toString() : '',
      record.userId,
      record.userRole,
      record.changeReason || '',
      record.ipAddress || '',
      record.userAgent || '',
      JSON.stringify(record.metadata || {}),
    ]);

    // Build CSV content
    let csvContent = `Property Address: ${propertyAddress}\n`;
    csvContent += `Export Date: ${new Date().toISOString()}\n\n`;
    csvContent += headers.map((h) => this.escapeCSVField(h)).join(',') + '\n';
    csvContent += rows.map((row) => row.map((field) => this.escapeCSVField(field)).join(',')).join('\n');

    return Buffer.from(csvContent, 'utf-8');
  }

  /**
   * Escape CSV field values to handle commas and quotes
   * Helper method for formatAsCSV
   *
   * @param field - Field value to escape
   * @returns Escaped field value
   */
  private escapeCSVField(field: any): string {
    const fieldStr = field.toString();
    if (fieldStr.includes(',') || fieldStr.includes('"') || fieldStr.includes('\n')) {
      return `"${fieldStr.replace(/"/g, '""')}"`;
    }
    return fieldStr;
  }

  /**
   * Format price history records as JSON
   * Helper method for exportData
   *
   * @param records - Array of price history records
   * @param propertyAddress - Property address for metadata
   * @returns Buffer with JSON data
   */
  private formatAsJSON(records: PriceHistory[], propertyAddress: string): Buffer {
    const data = {
      metadata: {
        propertyAddress,
        exportDate: new Date().toISOString(),
        recordCount: records.length,
      },
      records: records.map((record) => ({
        timestamp: record.timestamp.toISOString(),
        previousPrice: record.previousPrice.toString(),
        newPrice: record.newPrice.toString(),
        priceChangePercentage: record.priceChangePercentage ? record.priceChangePercentage.toString() : null,
        userId: record.userId,
        userRole: record.userRole,
        changeReason: record.changeReason,
        ipAddress: record.ipAddress,
        userAgent: record.userAgent,
        metadata: record.metadata,
      })),
    };

    return Buffer.from(JSON.stringify(data, null, 2), 'utf-8');
  }

  /**
   * Bulk export price history for multiple properties
   * Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.5, 12.6
   *
   * @param propertyIds - Array of property IDs to export
   * @param userId - The user ID requesting the export
   * @param userRole - The user's role
   * @param format - Export format (csv or json)
   * @param startDate - Optional start date for filtering
   * @param endDate - Optional end date for filtering
   * @returns Buffer with exported data
   */
  async bulkExport(
    propertyIds: string[],
    userId: string,
    userRole: UserRole,
    format: 'csv' | 'json' = 'json',
    startDate?: Date,
    endDate?: Date,
  ): Promise<Buffer> {
    // Validate user has permission for all specified properties
    for (const propertyId of propertyIds) {
      const hasPermission = await this.checkPermission(userId, userRole, propertyId);
      if (!hasPermission) {
        throw new BadRequestException(
          `User does not have permission to access price history for property ${propertyId}`,
        );
      }
    }

    // Build where clause with date range filtering
    const where: any = {
      propertyId: { in: propertyIds },
    };

    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) {
        where.timestamp.gte = startDate;
      }
      if (endDate) {
        where.timestamp.lte = endDate;
      }
    }

    // Query price history for all properties
    const records = await this.prisma.priceHistory.findMany({
      where,
      orderBy: [{ propertyId: 'asc' }, { timestamp: 'asc' }],
      include: { property: { select: { address: true } } },
    });

    if (format === 'csv') {
      return this.formatBulkAsCSV(records);
    } else {
      return this.formatBulkAsJSON(records);
    }
  }

  /**
   * Format bulk price history records as CSV
   * Helper method for bulkExport
   *
   * @param records - Array of price history records with property info
   * @returns Buffer with CSV data
   */
  private formatBulkAsCSV(records: any[]): Buffer {
    const headers = [
      'Property ID',
      'Property Address',
      'Timestamp',
      'Previous Price',
      'New Price',
      'Price Change Percentage',
      'User ID',
      'User Role',
      'Change Reason',
      'IP Address',
      'User Agent',
      'Metadata',
    ];

    const rows = records.map((record) => [
      record.propertyId,
      record.property.address,
      record.timestamp.toISOString(),
      record.previousPrice.toString(),
      record.newPrice.toString(),
      record.priceChangePercentage ? record.priceChangePercentage.toString() : '',
      record.userId,
      record.userRole,
      record.changeReason || '',
      record.ipAddress || '',
      record.userAgent || '',
      JSON.stringify(record.metadata || {}),
    ]);

    // Build CSV content
    let csvContent = `Bulk Price History Export\n`;
    csvContent += `Export Date: ${new Date().toISOString()}\n`;
    csvContent += `Total Records: ${records.length}\n\n`;
    csvContent += headers.map((h) => this.escapeCSVField(h)).join(',') + '\n';
    csvContent += rows.map((row) => row.map((field) => this.escapeCSVField(field)).join(',')).join('\n');

    return Buffer.from(csvContent, 'utf-8');
  }

  /**
   * Format bulk price history records as JSON
   * Helper method for bulkExport
   *
   * @param records - Array of price history records with property info
   * @returns Buffer with JSON data
   */
  private formatBulkAsJSON(records: any[]): Buffer {
    // Group records by property ID
    const groupedByProperty = new Map<string, any[]>();
    records.forEach((record) => {
      if (!groupedByProperty.has(record.propertyId)) {
        groupedByProperty.set(record.propertyId, []);
      }
      groupedByProperty.get(record.propertyId)!.push(record);
    });

    const data = {
      metadata: {
        exportDate: new Date().toISOString(),
        totalRecords: records.length,
        propertyCount: groupedByProperty.size,
      },
      properties: Array.from(groupedByProperty.entries()).map(([propertyId, propertyRecords]) => ({
        propertyId,
        propertyAddress: propertyRecords[0].property.address,
        recordCount: propertyRecords.length,
        records: propertyRecords.map((record) => ({
          timestamp: record.timestamp.toISOString(),
          previousPrice: record.previousPrice.toString(),
          newPrice: record.newPrice.toString(),
          priceChangePercentage: record.priceChangePercentage ? record.priceChangePercentage.toString() : null,
          userId: record.userId,
          userRole: record.userRole,
          changeReason: record.changeReason,
          ipAddress: record.ipAddress,
          userAgent: record.userAgent,
          metadata: record.metadata,
        })),
      })),
    };

    return Buffer.from(JSON.stringify(data, null, 2), 'utf-8');
  }
}
