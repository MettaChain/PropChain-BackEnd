import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import type { FeeBreakdown } from '../../../../src/transactions/dto/transaction.dto';

/** Lifecycle of a transaction escrow account. */
export enum EscrowStatus {
  PENDING = 'PENDING',
  HELD = 'HELD',
  RELEASED = 'RELEASED',
  REFUNDED = 'REFUNDED',
}

/** Audit actions recorded for every state transition. */
export enum EscrowAuditAction {
  CREATED = 'CREATED',
  FUNDS_HELD = 'FUNDS_HELD',
  MILESTONE_COMPLETED = 'MILESTONE_COMPLETED',
  RELEASED = 'RELEASED',
  REFUNDED = 'REFUNDED',
  DISPUTE_HOLD = 'DISPUTE_HOLD',
  DISPUTE_RESOLVED = 'DISPUTE_RESOLVED',
}

/** How a dispute hold is resolved. */
export enum DisputeResolution {
  RELEASE = 'RELEASE',
  REFUND = 'REFUND',
}

export class CreateEscrowDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  transactionId: string;

  @ApiProperty({ description: 'Base transaction amount before fees' })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiPropertyOptional({ type: [String], description: 'Milestones required before release' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  milestones?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  actorId?: string;
}

export class HoldFundsDto {
  @ApiPropertyOptional({ description: 'Defaults to the full escrow amount' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  actorId?: string;
}

export class CompleteMilestoneDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  milestoneId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  actorId?: string;
}

export class ReleaseEscrowDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  actorId?: string;
}

export class RefundEscrowDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  reason: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  actorId?: string;
}

export class DisputeEscrowDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  reason: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  actorId?: string;
}

export class ResolveDisputeDto {
  @ApiProperty({ enum: DisputeResolution })
  @IsEnum(DisputeResolution)
  resolution: DisputeResolution;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  actorId?: string;
}

export class EscrowAuditEntryDto {
  @ApiProperty({ enum: EscrowAuditAction })
  action: EscrowAuditAction;

  @ApiPropertyOptional()
  actorId?: string;

  @ApiPropertyOptional()
  details?: string;

  @ApiProperty()
  recordedAt: Date;
}

export class EscrowResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  transactionId: string;

  @ApiProperty({ description: 'Base transaction amount before fees' })
  baseAmount: number;

  @ApiProperty({ description: 'Escrow amount including the calculated fees' })
  amount: number;

  @ApiProperty()
  currency: string;

  @ApiProperty({ enum: EscrowStatus })
  status: EscrowStatus;

  @ApiProperty()
  balance: number;

  @ApiProperty()
  feeBreakdown: FeeBreakdown;

  @ApiProperty({ type: [String] })
  milestones: string[];

  @ApiProperty({ type: [String] })
  metMilestones: string[];

  @ApiProperty()
  disputed: boolean;

  @ApiPropertyOptional()
  disputeReason?: string;

  @ApiProperty({ type: [EscrowAuditEntryDto] })
  auditTrail: EscrowAuditEntryDto[];

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiPropertyOptional()
  releasedAt?: Date;

  @ApiPropertyOptional()
  refundedAt?: Date;
}
