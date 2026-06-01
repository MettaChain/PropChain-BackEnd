import { IsArray, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { ArrayMaxSize, ArrayMinSize } from 'class-validator';

/**
 * DTO for bulk exporting price history for multiple properties.
 * Validates: Requirements 12.1, 12.3
 */
export class BulkExportDto {
  /**
   * Array of property IDs to export price history for.
   * Minimum: 1 property, Maximum: 100 properties
   */
  @IsArray({ message: 'propertyIds must be an array' })
  @ArrayMinSize(1, { message: 'propertyIds must contain at least 1 property ID' })
  @ArrayMaxSize(100, { message: 'propertyIds cannot contain more than 100 property IDs' })
  @IsUUID('4', { each: true, message: 'each propertyId must be a valid UUID' })
  propertyIds: string[];

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
