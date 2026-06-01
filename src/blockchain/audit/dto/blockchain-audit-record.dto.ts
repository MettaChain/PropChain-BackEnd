import {
  IsDateString,
  IsNotEmpty,
  IsString,
  Matches,
} from 'class-validator';

export class BlockchainAuditRecordDto {
  @IsString()
  @IsNotEmpty()
  transactionId: string;

  @IsString()
  @Matches(/^[A-Fa-f0-9]{64}$/)
  transactionHash: string;

  @IsDateString()
  timestamp: string;
}