import { IsOptional, IsString, IsNumber, IsEnum, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IntersectionType } from '@nestjs/swagger';
import { PaginationDto, SortDto } from '../../common/dto';
import { PropertyType, PropertyStatus } from './create-property.dto';

export class PropertyFilterDto {
  @ApiPropertyOptional({
    description: 'Search by title or description',
    example: 'apartment',
  })
  @IsOptional()
  @IsString({ message: 'Search must be a string' })
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter by property type',
    enum: PropertyType,
  })
  @IsOptional()
  @IsEnum(PropertyType, { message: 'Invalid property type' })
  type?: PropertyType;

  @ApiPropertyOptional({
    description: 'Filter by status',
    enum: PropertyStatus,
  })
  @IsOptional()
  @IsEnum(PropertyStatus, { message: 'Invalid status' })
  status?: PropertyStatus;

  @ApiPropertyOptional({
    description: 'Filter by city',
    example: 'New York',
  })
  @IsOptional()
  @IsString({ message: 'City must be a string' })
  city?: string;

  @ApiPropertyOptional({
    description: 'Filter by country',
    example: 'United States',
  })
  @IsOptional()
  @IsString({ message: 'Country must be a string' })
  country?: string;

  @ApiPropertyOptional({
    description: 'Minimum price',
    example: 100000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'minPrice must be a number' })
  @Min(0, { message: 'minPrice cannot be negative' })
  minPrice?: number;

  @ApiPropertyOptional({
    description: 'Maximum price',
    example: 500000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'maxPrice must be a number' })
  @Min(0, { message: 'maxPrice cannot be negative' })
  maxPrice?: number;

  @ApiPropertyOptional({
    description: 'Minimum bedrooms',
    example: 2,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'minBedrooms must be a number' })
  @Min(0, { message: 'minBedrooms cannot be negative' })
  minBedrooms?: number;

  @ApiPropertyOptional({
    description: 'Maximum bedrooms',
    example: 5,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'maxBedrooms must be a number' })
  @Min(0, { message: 'maxBedrooms cannot be negative' })
  maxBedrooms?: number;

  @ApiPropertyOptional({
    description: 'Filter by owner ID',
    example: 'user_abc123',
  })
  @IsOptional()
  @IsString({ message: 'Owner ID must be a string' })
  ownerId?: string;
}

export class PropertyQueryDto extends IntersectionType(
  PropertyFilterDto,
  IntersectionType(PaginationDto, SortDto),
) {}
