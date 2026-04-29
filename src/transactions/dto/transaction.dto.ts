import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { TransactionType } from '../../types/prisma.types';

export class CreateTransactionDto {
  @IsUUID('4')
  propertyId!: string;

  @IsUUID('4')
  buyerId!: string;

  @IsUUID('4')
  sellerId!: string;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;
}

export class CreateTransactionTaxStrategyDto {
  @IsString()
  @MaxLength(100)
  strategyType!: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  jurisdiction?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  estimatedTaxRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  estimatedTaxImpact?: number;

  @IsString()
  @MaxLength(2000)
  explanation!: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  version?: number;
}

export class UpdateTransactionTaxStrategyDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  strategyType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  jurisdiction?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  estimatedTaxRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  estimatedTaxImpact?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  explanation?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  version?: number;
}
