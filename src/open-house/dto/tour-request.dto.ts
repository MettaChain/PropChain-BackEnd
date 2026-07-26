// @ts-nocheck

import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsInt,
  Matches,
  IsBoolean,
} from 'class-validator';
import { TourType } from '../open-house.service';

export class CreateTourRequestDto {
  @IsString()
  propertyId: string;

  @IsOptional()
  @IsString()
  agentId?: string;

  @IsOptional()
  @IsEnum(TourType)
  tourType?: TourType;

  @IsDateString()
  requestedAt: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  timezone?: string;
}

export class UpdateTourRequestStatusDto {
  @IsEnum(['CONFIRMED', 'CANCELLED', 'COMPLETED', 'DECLINED'])
  status: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateAgentAvailabilityDto {
  @IsInt()
  dayOfWeek: number;

  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  startTime: string;

  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  endTime: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AgentAvailabilityResponseDto {
  id: string;
  agentId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
}
