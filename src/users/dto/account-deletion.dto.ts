import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class RequestAccountDeletionDto {
  @IsOptional()
  @IsInt()
  @Min(7)
  @Max(90)
  retentionDays?: number;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class CancelAccountDeletionDto {}
