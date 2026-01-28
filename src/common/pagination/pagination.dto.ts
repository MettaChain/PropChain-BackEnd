import { IsOptional, IsInt, Min, Max, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100) // Acceptance Criteria: Add pagination limits
  limit?: number = 10;

  @IsOptional()
  @IsString()
  sort?: string = 'createdAt:DESC'; // Acceptance Criteria: Sort parameter
}