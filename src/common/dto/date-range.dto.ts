import { IsOptional, IsISO8601 } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class DateRangeDto {
  @ApiPropertyOptional({
    description: 'Filter items created after this date (ISO 8601)',
    example: '2024-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsISO8601({}, { message: 'createdAfter must be a valid ISO 8601 date' })
  createdAfter?: string;

  @ApiPropertyOptional({
    description: 'Filter items created before this date (ISO 8601)',
    example: '2024-12-31T23:59:59.999Z',
  })
  @IsOptional()
  @IsISO8601({}, { message: 'createdBefore must be a valid ISO 8601 date' })
  createdBefore?: string;
}
