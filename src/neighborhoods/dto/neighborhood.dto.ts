import {
  IsArray,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

const SCORE_MIN = 0;
const SCORE_MAX = 100;

export class SchoolDto {
  @IsString()
  name!: string;

  /** ELEMENTARY | MIDDLE | HIGH | COLLEGE | PRIVATE | CHARTER */
  @IsString()
  type!: string;

  @IsNumber()
  @Min(0)
  @Max(10)
  rating!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  distanceMiles?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  studentTeacherRatio?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  enrollmentCount?: number;

  @IsOptional()
  @IsString()
  url?: string;
}

export class AmenityDto {
  /** GROCERY | RESTAURANT | PARK | GYM | HOSPITAL | SCHOOL | TRANSIT | SHOPPING | etc. */
  @IsString()
  category!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  distanceMiles?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(5)
  rating?: number;

  @IsOptional()
  @IsString()
  address?: string;
}

export class CreateNeighborhoodDto {
  @IsString()
  name!: string;

  @IsString()
  city!: string;

  @IsString()
  state!: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsInt()
  @Min(SCORE_MIN)
  @Max(SCORE_MAX)
  walkScore?: number;

  @IsOptional()
  @IsInt()
  @Min(SCORE_MIN)
  @Max(SCORE_MAX)
  transitScore?: number;

  @IsOptional()
  @IsInt()
  @Min(SCORE_MIN)
  @Max(SCORE_MAX)
  bikeScore?: number;

  /** 0-100, lower is better. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  crimeIndex?: number;

  /** Free-form crime breakdown, e.g. { violent: 12.4, property: 33.0 }. */
  @IsOptional()
  @IsObject()
  crimeRate?: Record<string, unknown>;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  schoolRating?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SchoolDto)
  schools?: SchoolDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AmenityDto)
  amenities?: AmenityDto[];
}

export class UpdateNeighborhoodDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() state?: string;
  @IsOptional() @IsString() country?: string;

  @IsOptional() @IsInt() @Min(SCORE_MIN) @Max(SCORE_MAX) walkScore?: number;
  @IsOptional() @IsInt() @Min(SCORE_MIN) @Max(SCORE_MAX) transitScore?: number;
  @IsOptional() @IsInt() @Min(SCORE_MIN) @Max(SCORE_MAX) bikeScore?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) crimeIndex?: number;

  @IsOptional() @IsObject() crimeRate?: Record<string, unknown>;
  @IsOptional() @IsNumber() @Min(0) @Max(10) schoolRating?: number;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class ListNeighborhoodsQueryDto {
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() state?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number;
}

export class LinkPropertyDto {
  @IsUUID()
  neighborhoodId!: string;
}
