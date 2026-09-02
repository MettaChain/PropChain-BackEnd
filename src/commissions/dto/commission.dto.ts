import { IsString, IsOptional, IsEnum, IsUUID, IsNumber, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum CommissionStatusDto {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export class CommissionListQueryDto {
  @ApiPropertyOptional({ description: 'Filter by agent user ID' })
  @IsOptional()
  @IsString()
  @IsUUID()
  agentId?: string;

  @ApiPropertyOptional({ description: 'Filter by property ID' })
  @IsOptional()
  @IsString()
  @IsUUID()
  propertyId?: string;

  @ApiPropertyOptional({ description: 'Filter by transaction ID' })
  @IsOptional()
  @IsString()
  @IsUUID()
  transactionId?: string;

  @ApiPropertyOptional({ enum: CommissionStatusDto })
  @IsOptional()
  @IsEnum(CommissionStatusDto)
  status?: CommissionStatusDto;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 20;
}

export class CommissionResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  transactionId: string;

  @ApiProperty()
  agentId: string;

  @ApiProperty()
  propertyId: string;

  @ApiProperty()
  amount: number;

  @ApiProperty()
  rate: number;

  @ApiProperty({ enum: CommissionStatusDto })
  status: CommissionStatusDto;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
