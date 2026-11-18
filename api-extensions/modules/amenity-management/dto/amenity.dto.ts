import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export enum AmenityCategory {
  INTERIOR = 'INTERIOR',
  EXTERIOR = 'EXTERIOR',
  COMMUNITY = 'COMMUNITY',
  SAFETY = 'SAFETY',
  UTILITY = 'UTILITY',
}

export class CreateAmenityDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ enum: AmenityCategory })
  @IsEnum(AmenityCategory)
  category: AmenityCategory;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

export class AmenityQueryDto {
  @ApiPropertyOptional({ enum: AmenityCategory })
  @IsOptional()
  @IsEnum(AmenityCategory)
  category?: AmenityCategory;

  @ApiPropertyOptional()
  @IsOptional()
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

export class AssignPropertyAmenitiesDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  amenityIds: string[];
}

export class AmenityResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: AmenityCategory })
  category: AmenityCategory;

  @ApiPropertyOptional()
  icon?: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiProperty()
  isCustom: boolean;

  @ApiProperty()
  createdAt: Date;
}
