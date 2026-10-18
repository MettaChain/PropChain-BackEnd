
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

import { IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';

import { PROPERTY_STATUS_ENUM } from '../../common/common.types';
import { TrimListingQuery } from '../sanitize-listing-query.util';

export const PROPERTY_SORT_FIELDS = [
  'price',
  'createdAt',
  'updatedAt',
  'bedrooms',
  'bathrooms',
  'squareFeet',
  'yearBuilt',
] as const;

export type PropertySortField = (typeof PROPERTY_SORT_FIELDS)[number];

/**
 * Query DTO for advanced property search.
 *
 * Supports:
 *  - Price range (minPrice / maxPrice)
 *  - Location (city / state / zipCode / country, or free-text `location`)
 *  - Property type (propertyType)
 *  - Bedrooms (exact `bedrooms`, or range minBedrooms / maxBedrooms)
 *  - Bathrooms (exact `bathrooms`, or range minBathrooms / maxBathrooms)
 *  - Optional status filter, pagination and sorting
 */
export class SearchPropertiesDto {
  // ----- Price range -----
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  // ----- Location -----
  @IsOptional()
  @Transform(TrimListingQuery)
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @Transform(TrimListingQuery)
  @IsString()
  @MaxLength(100)
  state?: string;

  @IsOptional()
  @Transform(TrimListingQuery)
  @IsString()
  @MaxLength(100)
  zipCode?: string;

  @IsOptional()
  @Transform(TrimListingQuery)
  @IsString()
  @MaxLength(100)
  country?: string;

  /** Free-text search across address, city, state and zipCode (case-insensitive). */
  @IsOptional()
  @Transform(TrimListingQuery)
  @IsString()
  @MaxLength(100)
  location?: string;

  // ----- Property type -----
  @IsOptional()
  @Transform(TrimListingQuery)
  @IsString()
  @MaxLength(100)
  propertyType?: string;

  // ----- Bedrooms -----
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  bedrooms?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minBedrooms?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxBedrooms?: number;

  // ----- Bathrooms (Decimal in DB, supports half-baths) -----
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  bathrooms?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minBathrooms?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxBathrooms?: number;

  // ----- Status -----
  @IsOptional()
  @IsIn(PROPERTY_STATUS_ENUM)
  status?: (typeof PROPERTY_STATUS_ENUM)[number];

  // ----- Expiry date -----
  @IsOptional()
  @Type(() => Date)
  minExpiryDate?: Date;

  @IsOptional()
  @Type(() => Date)
  maxExpiryDate?: Date;

  // ----- Pagination -----
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  // ----- Year built (#555) -----
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1800)
  minYearBuilt?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1800)
  maxYearBuilt?: number;

  // ----- Neighborhood trust score (#554) -----
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  minNeighborhoodTrustScore?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  maxNeighborhoodTrustScore?: number;

  // ----- Sorting -----
  // Restricted to PROPERTY_SORT_FIELDS. It was @IsString() only, so the value
  // went straight into `orderBy: { [sortBy]: sortOrder }` and an unknown column
  // produced a Prisma error (500) instead of a validation error (400).
  @IsOptional()

  @IsIn(PROPERTY_SORT_FIELDS)
  sortBy?: PropertySortField;

  @Transform(TrimListingQuery)
  @IsIn(PROPERTY_SORT_FIELDS)
  sortBy?: string;


  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';

  // ----- Category / tag / amenity -----
  @IsOptional()
  @Transform(TrimListingQuery)
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @Transform(TrimListingQuery)
  @IsString()
  @MaxLength(100)
  tag?: string;

  @IsOptional()
  @Transform(TrimListingQuery)
  @IsString()
  @MaxLength(100)
  amenityType?: string;

  // ----- Geo (point + radius or bounding box) -----
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lng?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  radiusKm?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minLat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxLat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minLng?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxLng?: number;
}
