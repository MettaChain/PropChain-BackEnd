import { IsIn, IsOptional, IsString } from 'class-validator';

/**
 * DTO for exporting price history data in various formats.
 * Validates: Requirements 8.1, 8.2
 */
export class ExportDataDto {
  /**
   * Export format for the data.
   * Options: 'csv', 'json'
   * Default: 'json'
   */
  @IsOptional()
  @IsIn(['csv', 'json'], {
    message: "format must be either 'csv' or 'json'",
  })
  format: 'csv' | 'json' = 'json';

  /**
   * Start date for filtering exported records (ISO 8601 format).
   * Optional filter parameter.
   */
  @IsOptional()
  @IsString({ message: 'startDate must be a valid ISO 8601 string' })
  startDate?: string;

  /**
   * End date for filtering exported records (ISO 8601 format).
   * Optional filter parameter.
   */
  @IsOptional()
  @IsString({ message: 'endDate must be a valid ISO 8601 string' })
  endDate?: string;
}
