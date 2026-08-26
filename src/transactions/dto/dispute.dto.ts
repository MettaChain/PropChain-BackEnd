import { IsString, IsOptional, IsUUID, IsEnum } from 'class-validator';
import { DisputeStatus } from '../../types/prisma.types';

export class CreateDisputeDto {
  @IsUUID()
  transactionId: string;

  @IsString()
  reason: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class ResolveDisputeDto {
  @IsEnum(DisputeStatus)
  status: DisputeStatus;

  @IsString()
  details: string;
}
