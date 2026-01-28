import {
  IsString,
  IsNotEmpty,
  IsNumber,
  ValidateNested,
  IsArray,
  IsOptional,
  IsPositive,
  MaxLength,
  ArrayMaxSize,
  Min,
  Max,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum PropertyType {
  RESIDENTIAL = 'RESIDENTIAL',
  COMMERCIAL = 'COMMERCIAL',
  INDUSTRIAL = 'INDUSTRIAL',
  LAND = 'LAND',
}

export enum PropertyStatus {
  AVAILABLE = 'AVAILABLE',
  PENDING = 'PENDING',
  SOLD = 'SOLD',
  RENTED = 'RENTED',
}

export class AddressDto {
  @ApiProperty({
    description: 'Street address',
    example: '123 Main Street',
    maxLength: 255,
  })
  @IsString({ message: 'Street must be a string' })
  @IsNotEmpty({ message: 'Street is required' })
  @MaxLength(255, { message: 'Street must not exceed 255 characters' })
  street: string;

  @ApiProperty({
    description: 'City name',
    example: 'New York',
    maxLength: 100,
  })
  @IsString({ message: 'City must be a string' })
  @IsNotEmpty({ message: 'City is required' })
  @MaxLength(100, { message: 'City must not exceed 100 characters' })
  city: string;

  @ApiPropertyOptional({
    description: 'State or province',
    example: 'NY',
    maxLength: 100,
  })
  @IsOptional()
  @IsString({ message: 'State must be a string' })
  @MaxLength(100, { message: 'State must not exceed 100 characters' })
  state?: string;

  @ApiPropertyOptional({
    description: 'Postal/ZIP code',
    example: '10001',
    maxLength: 20,
  })
  @IsOptional()
  @IsString({ message: 'Postal code must be a string' })
  @MaxLength(20, { message: 'Postal code must not exceed 20 characters' })
  postalCode?: string;

  @ApiProperty({
    description: 'Country name or code',
    example: 'United States',
    maxLength: 100,
  })
  @IsString({ message: 'Country must be a string' })
  @IsNotEmpty({ message: 'Country is required' })
  @MaxLength(100, { message: 'Country must not exceed 100 characters' })
  country: string;
}

export class CreatePropertyDto {
  @ApiProperty({
    description: 'Property title',
    example: 'Luxury Downtown Apartment',
    maxLength: 200,
  })
  @IsString({ message: 'Title must be a string' })
  @IsNotEmpty({ message: 'Title is required' })
  @MaxLength(200, { message: 'Title must not exceed 200 characters' })
  title: string;

  @ApiPropertyOptional({
    description: 'Property description',
    example: 'Beautiful 2-bedroom apartment with city views',
    maxLength: 5000,
  })
  @IsOptional()
  @IsString({ message: 'Description must be a string' })
  @MaxLength(5000, { message: 'Description must not exceed 5000 characters' })
  description?: string;

  @ApiProperty({
    description: 'Property price in USD',
    example: 500000,
    minimum: 0,
  })
  @IsNumber({}, { message: 'Price must be a number' })
  @IsPositive({ message: 'Price must be a positive number' })
  @Min(0, { message: 'Price cannot be negative' })
  @Max(999999999999, { message: 'Price exceeds maximum allowed value' })
  price: number;

  @ApiProperty({
    description: 'Property address',
    type: AddressDto,
  })
  @ValidateNested({ message: 'Address must be a valid object' })
  @Type(() => AddressDto)
  address: AddressDto;

  @ApiPropertyOptional({
    description: 'Property features list',
    example: ['Swimming Pool', 'Garage', 'Garden'],
    type: [String],
    maxItems: 50,
  })
  @IsOptional()
  @IsArray({ message: 'Features must be an array' })
  @IsString({ each: true, message: 'Each feature must be a string' })
  @ArrayMaxSize(50, { message: 'Cannot have more than 50 features' })
  @MaxLength(100, { each: true, message: 'Each feature must not exceed 100 characters' })
  features?: string[];

  @ApiPropertyOptional({
    description: 'Property type',
    enum: PropertyType,
    example: PropertyType.RESIDENTIAL,
  })
  @IsOptional()
  @IsEnum(PropertyType, { message: 'Invalid property type' })
  type?: PropertyType;

  @ApiPropertyOptional({
    description: 'Property status',
    enum: PropertyStatus,
    default: PropertyStatus.AVAILABLE,
  })
  @IsOptional()
  @IsEnum(PropertyStatus, { message: 'Invalid property status' })
  status?: PropertyStatus;

  @ApiPropertyOptional({
    description: 'Number of bedrooms',
    example: 3,
    minimum: 0,
  })
  @IsOptional()
  @IsNumber({}, { message: 'Bedrooms must be a number' })
  @Min(0, { message: 'Bedrooms cannot be negative' })
  @Max(100, { message: 'Bedrooms cannot exceed 100' })
  bedrooms?: number;

  @ApiPropertyOptional({
    description: 'Number of bathrooms',
    example: 2,
    minimum: 0,
  })
  @IsOptional()
  @IsNumber({}, { message: 'Bathrooms must be a number' })
  @Min(0, { message: 'Bathrooms cannot be negative' })
  @Max(100, { message: 'Bathrooms cannot exceed 100' })
  bathrooms?: number;

  @ApiPropertyOptional({
    description: 'Property size in square feet',
    example: 1500,
    minimum: 0,
  })
  @IsOptional()
  @IsNumber({}, { message: 'Area must be a number' })
  @IsPositive({ message: 'Area must be positive' })
  areaSqFt?: number;
}
