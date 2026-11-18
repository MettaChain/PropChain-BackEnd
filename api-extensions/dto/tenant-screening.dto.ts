import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { CleanText } from '../../src/auth/sanitize.util';

export enum ScreeningStatusEnum {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum ScreeningRecommendationEnum {
  APPROVE = 'APPROVE',
  CONDITIONAL = 'CONDITIONAL',
  DENY = 'DENY',
}

export enum RiskSeverityEnum {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

export class CreateScreeningDto {
  @ApiProperty()
  @Transform(CleanText)
  @IsString()
  @IsNotEmpty()
  applicantName: string;

  @ApiProperty()
  @IsEmail()
  applicantEmail: string;

  @ApiProperty()
  @IsUUID()
  propertyId: string;
}

export class RiskFactorDto {
  @ApiProperty()
  @Transform(CleanText)
  @IsString()
  @IsNotEmpty()
  factor: string;

  @ApiProperty({ enum: RiskSeverityEnum })
  @IsEnum(RiskSeverityEnum)
  severity: RiskSeverityEnum;

  @ApiProperty()
  @Transform(CleanText)
  @IsString()
  @IsNotEmpty()
  description: string;
}

export class ScreeningResultDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  @IsUUID()
  propertyId: string;

  @ApiProperty({ enum: ScreeningStatusEnum })
  @IsEnum(ScreeningStatusEnum)
  status: ScreeningStatusEnum;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(300)
  @Max(850)
  creditScore?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  backgroundStatus?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  incomeVerified?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  completedAt?: Date;
}

export class ScreeningSummaryDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ description: 'Overall screening score from 0 to 100' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  overallScore: number;

  @ApiProperty({ enum: ScreeningRecommendationEnum })
  @IsEnum(ScreeningRecommendationEnum)
  recommendation: ScreeningRecommendationEnum;

  @ApiProperty({ type: [RiskFactorDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RiskFactorDto)
  riskFactors: RiskFactorDto[];

  @ApiProperty()
  createdAt: Date;
}
