import { Type } from 'class-transformer';
import { IsISO8601, IsOptional, IsString, IsInt, Min, Max } from 'class-validator';

export class AuditLogQueryDto {
  @IsOptional()
  @IsString()
  actorId?: string;

  @IsOptional()
  @IsISO8601()
  @Type(() => Date)
  dateFrom?: Date;

  @IsOptional()
  @IsISO8601()
  @Type(() => Date)
  dateTo?: Date;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
