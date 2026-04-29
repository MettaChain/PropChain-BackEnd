import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { FraudPattern, FraudSeverity, FraudStatus } from '../../types/prisma.types';

export class FraudAlertsQueryDto {
  @IsOptional()
  @IsEnum(FraudStatus)
  status?: FraudStatus;

  @IsOptional()
  @IsEnum(FraudSeverity)
  severity?: FraudSeverity;

  @IsOptional()
  @IsEnum(FraudPattern)
  pattern?: FraudPattern;

  @IsOptional()
  @IsUUID('4')
  userId?: string;

  @IsOptional()
  @IsUUID('4')
  assignedToId?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  autoBlocked?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}

export class ReviewFraudAlertDto {
  @IsOptional()
  @IsEnum(FraudStatus)
  status?: FraudStatus;

  @IsOptional()
  @IsUUID('4')
  assignedToId?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  blockUser?: boolean;
}

export class AddFraudInvestigationNoteDto {
  @IsString()
  note!: string;

  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class BlockFraudUserDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
