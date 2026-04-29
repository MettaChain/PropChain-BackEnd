import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateBackupScheduleDto {
  @IsBoolean()
  enabled!: boolean;

  @IsString()
  @IsNotEmpty()
  cronExpression!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  retentionCount?: number;
}

export class RestoreBackupDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  reason?: string;
}
