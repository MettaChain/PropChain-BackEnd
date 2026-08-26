import { IsString, IsOptional, IsNumber, Min } from 'class-validator';

export class CancelTransactionDto {
  @IsString()
  reason: string;

  /** Optional refund amount. Defaults to full transaction amount if omitted. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  refundAmount?: number;
}
