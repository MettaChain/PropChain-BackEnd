import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export enum MaintenanceStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED',
}

export enum MaintenancePriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  EMERGENCY = 'EMERGENCY',
}

export class CreateMaintenanceRequestDto {
  @ApiProperty({ description: 'Property identifier' })
  @IsUUID()
  propertyId: string;

  @ApiProperty({ description: 'Short maintenance request title' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ description: 'Detailed description of the issue' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ enum: MaintenancePriority })
  @IsEnum(MaintenancePriority)
  priority: MaintenancePriority;

  @ApiPropertyOptional({ description: 'Requested completion date' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dueDate?: Date;
}

export class UpdateMaintenanceRequestDto {
  @ApiPropertyOptional({ enum: MaintenanceStatus })
  @IsOptional()
  @IsEnum(MaintenanceStatus)
  status?: MaintenanceStatus;

  @ApiPropertyOptional({ description: 'Technician assigned to the request' })
  @IsOptional()
  @IsString()
  assignedTo?: string;

  @ApiPropertyOptional({ description: 'Additional notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Cost incurred for this request' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  cost?: number;

  @ApiPropertyOptional({ description: 'Scheduled visit date' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  scheduledDate?: Date;
}

export class MaintenanceQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  propertyId?: string;

  @ApiPropertyOptional({ enum: MaintenanceStatus })
  @IsOptional()
  @IsEnum(MaintenanceStatus)
  status?: MaintenanceStatus;

  @ApiPropertyOptional({ enum: MaintenancePriority })
  @IsOptional()
  @IsEnum(MaintenancePriority)
  priority?: MaintenancePriority;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assignedTo?: string;
}

export class MaintenanceCostDto {
  @ApiProperty()
  amount: number;

  @ApiProperty()
  recordedAt: Date;

  @ApiPropertyOptional()
  notes?: string;
}

export class MaintenanceRequestResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  propertyId: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  description: string;

  @ApiProperty({ enum: MaintenanceStatus })
  status: MaintenanceStatus;

  @ApiProperty({ enum: MaintenancePriority })
  priority: MaintenancePriority;

  @ApiPropertyOptional()
  assignedTo?: string;

  @ApiPropertyOptional()
  scheduledDate?: Date;

  @ApiPropertyOptional()
  dueDate?: Date;

  @ApiProperty()
  totalCost: number;

  @ApiProperty({ type: [MaintenanceCostDto] })
  costs: MaintenanceCostDto[];

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiPropertyOptional()
  resolvedAt?: Date;

  @ApiPropertyOptional()
  closedAt?: Date;
}
