import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export enum SplitStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  PAID = 'PAID',
  DISPUTED = 'DISPUTED',
}

export enum PayoutStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  DISPUTED = 'DISPUTED',
}

export class CommissionParticipantDto {
  @ApiProperty()
  @IsUUID()
  userId: string;

  @ApiProperty()
  @IsString()
  role: string;

  @ApiProperty({ description: 'Percentage of the commission split' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  splitPercentage: number;
}

export class CreateCommissionSplitDto {
  @ApiProperty()
  @IsUUID()
  transactionId: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  totalAmount: number;

  @ApiProperty({ type: [CommissionParticipantDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CommissionParticipantDto)
  participants: CommissionParticipantDto[];

  @ApiPropertyOptional({ description: 'Optional commission tier label' })
  @IsOptional()
  @IsString()
  tier?: string;
}

export class UpdateCommissionSplitDto {
  @ApiPropertyOptional({ enum: SplitStatus })
  @IsOptional()
  @IsEnum(SplitStatus)
  status?: SplitStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  adjustment?: number;
}

export class CommissionParticipantResponseDto extends CommissionParticipantDto {
  @ApiProperty()
  amount: number;

  @ApiProperty({ enum: PayoutStatus })
  payoutStatus: PayoutStatus;
}

export class CommissionSplitResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  transactionId: string;

  @ApiProperty()
  totalAmount: number;

  @ApiProperty()
  adjustment: number;

  @ApiPropertyOptional()
  tier?: string;

  @ApiProperty({ enum: SplitStatus })
  status: SplitStatus;

  @ApiProperty({ type: [CommissionParticipantResponseDto] })
  participants: CommissionParticipantResponseDto[];

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
