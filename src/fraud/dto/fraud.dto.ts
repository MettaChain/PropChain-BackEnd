import { FraudAlertStatus, FraudEntityType, FraudSeverity } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class FraudAlertsQueryDto {
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

  @IsOptional()
  @IsEnum(FraudSeverity)
  severity?: FraudSeverity;

  @IsOptional()
  @IsEnum(FraudAlertStatus)
  status?: FraudAlertStatus;

  @IsOptional()
  @IsEnum(FraudEntityType)
  entityType?: FraudEntityType;

  @IsOptional()
  @IsString()
  entityId?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  patternCode?: string;

  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  autoBlocked?: boolean;
}

export class AssignFraudAlertDto {
  @IsOptional()
  @IsString()
  assignedToId?: string;

  @IsOptional()
  @IsString()
  assignedToEmail?: string;
}

export class UpdateFraudAlertStatusDto {
  @IsEnum(FraudAlertStatus)
  status: FraudAlertStatus;

  @IsOptional()
  @IsString()
  @MinLength(3)
  resolutionNotes?: string;
}

export class AddFraudInvestigationNoteDto {
  @IsString()
  @MinLength(3)
  note: string;
}

export class ManualFraudBlockDto {
  @IsString()
  @MinLength(3)
  reason: string;
}
