import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export enum ScreeningStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum ScreeningRecommendation {
  APPROVE = 'APPROVE',
  CONDITIONAL = 'CONDITIONAL',
  DENY = 'DENY',
}

export enum RiskSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

export class CreateScreeningDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  applicantName: string;

  @ApiProperty()
  @IsEmail()
  applicantEmail: string;

  @ApiProperty()
  @IsUUID()
  propertyId: string;

  @ApiProperty({ description: 'Gross monthly income' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  monthlyIncome: number;

  @ApiProperty({ description: 'Expected monthly rent' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  monthlyRent: number;

  @ApiProperty({ description: 'Applicant consent for screening checks' })
  @IsBoolean()
  consent: boolean;

  @ApiPropertyOptional({ description: 'Opt out of retaining screening data' })
  @IsOptional()
  @IsBoolean()
  optOut?: boolean;
}

export class RiskFactorDto {
  @ApiProperty()
  factor: string;

  @ApiProperty({ enum: RiskSeverity })
  severity: RiskSeverity;

  @ApiProperty()
  description: string;
}

export class ScreeningResultDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  propertyId: string;

  @ApiProperty({ enum: ScreeningStatus })
  status: ScreeningStatus;

  @ApiPropertyOptional()
  creditScore?: number;

  @ApiPropertyOptional()
  backgroundStatus?: string;

  @ApiPropertyOptional()
  incomeVerified?: boolean;

  @ApiPropertyOptional()
  overallScore?: number;

  @ApiPropertyOptional({ enum: ScreeningRecommendation })
  recommendation?: ScreeningRecommendation;

  @ApiPropertyOptional({ type: [RiskFactorDto] })
  riskFactors?: RiskFactorDto[];

  @ApiProperty()
  createdAt: Date;

  @ApiPropertyOptional()
  completedAt?: Date;
}
