import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import {
  FraudAlertsQueryDto,
  ReviewFraudAlertDto,
  AddFraudInvestigationNoteDto,
  BlockFraudUserDto,
} from '../../fraud/dto/fraud.dto';
import {
  PropertyStatus,
  TransactionStatus,
  TransactionType,
  UserRole,
} from '../../types/prisma.types';

export class AdminUsersQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

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

export class AdminUpdateUserDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  isVerified?: boolean;
}

export class ModerationQueueQueryDto {
  @IsOptional()
  @IsEnum(PropertyStatus)
  status?: PropertyStatus;

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

export class FlagPropertyDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export enum BulkModerationAction {
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
  FLAG = 'FLAG',
}

export class BulkModerationDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  propertyIds!: string[];

  @IsEnum(BulkModerationAction)
  action!: BulkModerationAction;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class TransactionMonitoringQueryDto {
  @IsOptional()
  @IsEnum(TransactionStatus)
  status?: TransactionStatus;

  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @IsOptional()
  @IsUUID('4')
  propertyId?: string;

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

export class UpdateTransactionStatusDto {
  @IsEnum(TransactionStatus)
  status!: TransactionStatus;
}

export {
  AddFraudInvestigationNoteDto,
  BlockFraudUserDto,
  FraudAlertsQueryDto,
  ReviewFraudAlertDto,
};
