import { IsIn, IsOptional, IsString } from 'class-validator';

/**
 * DTO for requesting chart data with time interval aggregation.
 * Validates: Requirements 4.1, 4.4
 */
export class ChartDataDto {
  /**
   * Time interval for data aggregation.
   * Options: 'daily', 'weekly', 'monthly', 'yearly'
   * Default: 'daily'
   */
  @IsOptional()
  @IsIn(['daily', 'weekly', 'monthly', 'yearly'], {
    message: "interval must be one of: 'daily', 'weekly', 'monthly', 'yearly'",
  })
  interval: 'daily' | 'weekly' | 'monthly' | 'yearly' = 'daily';

  /**
   * Start date for the date range (ISO 8601 format).
   * Optional filter parameter.
   */
  @IsOptional()
  @IsString({ message: 'startDate must be a valid ISO 8601 string' })
  startDate?: string;

  /**
   * End date for the date range (ISO 8601 format).
   * Optional filter parameter.
   */
  @IsOptional()
  @IsString({ message: 'endDate must be a valid ISO 8601 string' })
  endDate?: string;
}
