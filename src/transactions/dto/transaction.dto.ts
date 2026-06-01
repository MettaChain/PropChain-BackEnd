import { IsString, IsNumber, IsOptional, IsEnum, IsUUID, IsDate, IsIn, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export interface FeeBreakdown {
  transactionAmount: number;
  platformFee: number;
  platformFeeRate: number;
  agentCommission: number;
  agentCommissionRate: number;
  tax: number;
  taxRate: number;
  totalFees: number;
  totalAmount: number;
}

export enum TransactionTypeDto {
  SALE = 'SALE',
  PURCHASE = 'PURCHASE',
  TRANSFER = 'TRANSFER',
}

export enum TransactionStatusDto {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  FAILED = 'FAILED',
}

export class CreateTransactionDto {
  @ApiProperty({ description: 'Property ID' })
  @IsString()
  @IsUUID()
  propertyId: string;

  @ApiProperty({ description: 'Buyer user ID' })
  @IsString()
  @IsUUID()
  buyerId: string;

  @ApiProperty({ description: 'Seller user ID' })
  @IsString()
  @IsUUID()
  sellerId: string;

  @ApiProperty({ description: 'Transaction amount in currency' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiProperty({ enum: TransactionTypeDto })
  @IsEnum(TransactionTypeDto)
  type: TransactionTypeDto;

  @ApiPropertyOptional({ description: 'Transaction notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateTransactionDto {
  @ApiPropertyOptional({ enum: TransactionStatusDto })
  @IsOptional()
  @IsEnum(TransactionStatusDto)
  status?: TransactionStatusDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class RecordTransactionOnChainDto {
  @ApiPropertyOptional({ description: 'Buyer wallet address' })
  @IsOptional()
  @IsString()
  buyerAddress?: string;

  @ApiPropertyOptional({ description: 'Seller wallet address' })
  @IsOptional()
  @IsString()
  sellerAddress?: string;

  @ApiPropertyOptional({ description: 'Additional metadata' })
  @IsOptional()
  metadata?: Record<string, any>;
}

export class TransactionResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  propertyId: string;

  @ApiProperty()
  buyerId: string;

  @ApiProperty()
  sellerId: string;

  @ApiProperty()
  amount: number;

  @ApiProperty({ enum: TransactionTypeDto })
  type: TransactionTypeDto;

  @ApiProperty({ enum: TransactionStatusDto })
  status: TransactionStatusDto;

  @ApiPropertyOptional()
  blockchainHash?: string;

  @ApiPropertyOptional()
  contractAddress?: string;

  @ApiPropertyOptional()
  notes?: string;

  @ApiPropertyOptional({ description: 'Fee breakdown including platform fee, agent commission, and tax (#565)' })
  feeBreakdown?: FeeBreakdown;
  
  @ApiPropertyOptional()
  escrowStatus?: string;

  @ApiPropertyOptional()
  escrowAmount?: any;

  @ApiPropertyOptional()
  paymentStatus?: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class TransactionListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  propertyId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  buyerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  sellerId?: string;

  @ApiPropertyOptional({ enum: TransactionStatusDto })
  @IsOptional()
  @IsEnum(TransactionStatusDto)
  status?: TransactionStatusDto;

  @ApiPropertyOptional({ enum: TransactionTypeDto })
  @IsOptional()
  @IsEnum(TransactionTypeDto)
  type?: TransactionTypeDto;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit: number = 20;
}

export enum TransactionAnalyticsGranularity {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
}

export class TransactionAnalyticsQueryDto {
  @ApiPropertyOptional({ description: 'Only include transactions created on or after this date' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startDate?: Date;

  @ApiPropertyOptional({ description: 'Only include transactions created on or before this date' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;

  @ApiPropertyOptional({
    enum: TransactionAnalyticsGranularity,
    default: TransactionAnalyticsGranularity.MONTH,
  })
  @IsOptional()
  @IsEnum(TransactionAnalyticsGranularity)
  granularity?: TransactionAnalyticsGranularity = TransactionAnalyticsGranularity.MONTH;

  @ApiPropertyOptional({ enum: TransactionTypeDto })
  @IsOptional()
  @IsEnum(TransactionTypeDto)
  type?: TransactionTypeDto;
}

export class TransactionVolumeTrendDto {
  @ApiProperty()
  period: string;

  @ApiProperty()
  transactionCount: number;

  @ApiProperty()
  totalVolume: number;

  @ApiProperty()
  completedCount: number;

  @ApiProperty()
  revenue: number;
}

export class TransactionAnalyticsDto {
  @ApiProperty()
  totalTransactions: number;

  @ApiProperty()
  completedTransactions: number;

  @ApiProperty()
  pendingTransactions: number;

  @ApiProperty()
  cancelledTransactions: number;

  @ApiProperty()
  totalVolume: number;

  @ApiProperty()
  averagePrice: number;

  @ApiProperty()
  completionRate: number;

  @ApiProperty()
  revenue: number;

  @ApiProperty({ type: [TransactionVolumeTrendDto] })
  volumeTrends: TransactionVolumeTrendDto[];
}

export class CreateTransactionTaxStrategyDto {
  @ApiProperty({ description: 'Tax strategy type' })
  @IsString()
  strategyType!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedTaxImpact?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  explanation?: string;
}

export class UpdateEscrowDto {
  @ApiPropertyOptional({ enum: ['PENDING', 'HELD', 'RELEASED', 'REFUNDED'] })
  @IsOptional()
  @IsIn(['PENDING', 'HELD', 'RELEASED', 'REFUNDED'])
  escrowStatus?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  escrowAmount?: number;

  @ApiPropertyOptional({ enum: ['PENDING', 'PARTIAL', 'COMPLETE'] })
  @IsOptional()
  @IsIn(['PENDING', 'PARTIAL', 'COMPLETE'])
  paymentStatus?: string;
}
