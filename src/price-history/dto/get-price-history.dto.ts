import { IsInt, IsOptional, IsString, Max, Min, IsIn, Type } from 'class-validator';

/**
 * DTO for retrieving price history with pagination and filtering.
 * Validates: Requirements 2.2, 2.3, 9.6
 */
export class GetPriceHistoryDto {
  /**
   * Number of records to return per page.
   * Default: 50, Max: 500
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit must be an integer' })
  @Min(1, { message: 'limit must be at least 1' })
  @Max(500, { message: 'limit cannot exceed 500' })
  limit: number = 50;

  /**
   * Number of records to skip for pagination.
   * Default: 0
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'offset must be an integer' })
  @Min(0, { message: 'offset cannot be negative' })
  offset: number = 0;

  /**
   * Start date for filtering price history records (ISO 8601 format).
   * Optional filter parameter.
   */
  @IsOptional()
  @IsString({ message: 'startDate must be a valid ISO 8601 string' })
  startDate?: string;

  /**
   * End date for filtering price history records (ISO 8601 format).
   * Optional filter parameter.
   */
  @IsOptional()
  @IsString({ message: 'endDate must be a valid ISO 8601 string' })
  endDate?: string;

  /**
   * Field to sort results by.
   * Options: 'timestamp', 'price', 'percentage_change'
   * Default: 'timestamp'
   */
  @IsOptional()
  @IsIn(['timestamp', 'price', 'percentage_change'], {
    message: "sortBy must be one of: 'timestamp', 'price', 'percentage_change'",
  })
  sortBy: string = 'timestamp';

  /**
   * Sort order for results.
   * Options: 'ASC', 'DESC'
   * Default: 'DESC'
   */
  @IsOptional()
  @IsIn(['ASC', 'DESC'], {
    message: "sortOrder must be either 'ASC' or 'DESC'",
  })
  sortOrder: 'ASC' | 'DESC' = 'DESC';
}
