import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { CleanText } from '../../src/auth/sanitize.util';

export enum AmenityCategoryEnum {
  INTERIOR = 'INTERIOR',
  EXTERIOR = 'EXTERIOR',
  COMMUNITY = 'COMMUNITY',
  SAFETY = 'SAFETY',
  UTILITY = 'UTILITY',
}

export class CreateAmenityDto {
  @ApiProperty()
  @Transform(CleanText)
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ enum: AmenityCategoryEnum })
  @IsEnum(AmenityCategoryEnum)
  category: AmenityCategoryEnum;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(CleanText)
  @IsString()
  description?: string;
}

export class AssignPropertyAmenitiesDto {
  @ApiProperty()
  @IsUUID()
  propertyId: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  amenityIds: string[];
}

export class AmenityQueryDto {
  @ApiPropertyOptional({ enum: AmenityCategoryEnum })
  @IsOptional()
  @IsEnum(AmenityCategoryEnum)
  category?: AmenityCategoryEnum;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(CleanText)
  @IsString()
  search?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class AmenityResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: AmenityCategoryEnum })
  category: AmenityCategoryEnum;

  @ApiPropertyOptional()
  icon?: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiProperty()
  @IsBoolean()
  isCustom: boolean;

  @ApiProperty()
  createdAt: Date;
}
