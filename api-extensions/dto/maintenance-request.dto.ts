import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { CleanText } from '../../src/auth/sanitize.util';

export enum MaintenancePriorityEnum {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  EMERGENCY = 'EMERGENCY',
}

export enum MaintenanceStatusEnum {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED',
}

export class CreateMaintenanceRequestDto {
  @ApiProperty()
  @IsUUID()
  propertyId: string;

  @ApiProperty()
  @Transform(CleanText)
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty()
  @Transform(CleanText)
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ enum: MaintenancePriorityEnum })
  @IsEnum(MaintenancePriorityEnum)
  priority: MaintenancePriorityEnum;
}

export class UpdateMaintenanceRequestDto {
  @ApiPropertyOptional({ enum: MaintenanceStatusEnum })
  @IsOptional()
  @IsEnum(MaintenanceStatusEnum)
  status?: MaintenanceStatusEnum;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  cost?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(CleanText)
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assignedTo?: string;
}

export class MaintenanceQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  propertyId?: string;

  @ApiPropertyOptional({ enum: MaintenanceStatusEnum })
  @IsOptional()
  @IsEnum(MaintenanceStatusEnum)
  status?: MaintenanceStatusEnum;

  @ApiPropertyOptional({ enum: MaintenancePriorityEnum })
  @IsOptional()
  @IsEnum(MaintenancePriorityEnum)
  priority?: MaintenancePriorityEnum;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class MaintenanceResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  propertyId: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  description: string;

  @ApiProperty({ enum: MaintenanceStatusEnum })
  status: MaintenanceStatusEnum;

  @ApiProperty({ enum: MaintenancePriorityEnum })
  priority: MaintenancePriorityEnum;

  @ApiProperty()
  cost: number;

  @ApiPropertyOptional()
  assignedTo?: string;

  @ApiPropertyOptional()
  notes?: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiPropertyOptional()
  resolvedAt?: Date;

  @ApiPropertyOptional()
  closedAt?: Date;
}
