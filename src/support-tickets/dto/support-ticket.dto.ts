// @ts-nocheck

import {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  IsDateString,
  MaxLength,
  Min,
  Max,
} from 'class-validator';

export class CreateSupportTicketDto {
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  priority?: string;

  @IsString()
  @MaxLength(200)
  subject: string;

  @IsString()
  description: string;

  @IsOptional()
  @IsString()
  transactionId?: string;

  @IsOptional()
  @IsString()
  propertyId?: string;
}

export class UpdateTicketStatusDto {
  @IsString()
  status: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class AssignTicketDto {
  @IsString()
  agentId: string;
}

export class AddTicketNoteDto {
  @IsString()
  content: string;

  @IsOptional()
  isPublic?: boolean;
}

export class ListTicketsDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  priority?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class TicketSlaInfo {
  deadline: Date | null;
  breached: boolean;
  timeRemaining: string | null;
}

export class SupportTicketResponseDto {
  id: string;
  userId: string;
  assignedToId: string | null;
  category: string;
  priority: string;
  status: string;
  subject: string;
  description: string;
  transactionId: string | null;
  propertyId: string | null;
  slaDeadline: Date | null;
  slaBreached: boolean;
  firstResponseAt: Date | null;
  resolvedAt: Date | null;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
