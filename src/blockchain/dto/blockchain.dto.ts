// @ts-nocheck

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { IsString, IsNumber, IsOptional, IsEthereumAddress, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum BlockchainNetwork {
  ETHEREUM = 'ethereum',
  SEPOLIA = 'sepolia',
  POLYGON = 'polygon',
  MUMBAI = 'mumbai',
}

export class RecordTransactionOnBlockchainDto {
  @ApiProperty({ description: 'Transaction ID from database' })
  @IsString()
  transactionId: string;

  @ApiProperty({ description: 'Property ID associated with transaction' })
  @IsString()
  propertyId: string;

  @ApiProperty({ description: 'Buyer wallet address' })
  @IsString()
  buyerAddress: string;

  @ApiProperty({ description: 'Seller wallet address' })
  @IsString()
  sellerAddress: string;

  @ApiProperty({ description: 'Transaction amount in wei' })
  @IsNumber()
  amount: number;

  @ApiPropertyOptional({ description: 'Transaction metadata (JSON)', type: 'object' })
  @IsOptional()
  metadata?: Record<string, any>;

  @ApiPropertyOptional({ enum: BlockchainNetwork, description: 'Target blockchain network' })
  @IsOptional()
  @IsEnum(BlockchainNetwork)
  network?: BlockchainNetwork;
}

export class BlockchainTransactionDto {
  @ApiProperty()
  transactionHash: string;

  @ApiProperty()
  blockchainHash: string;

  @ApiProperty()
  contractAddress: string;

  @ApiProperty()
  blockNumber: number;

  @ApiProperty()
  status: 'pending' | 'confirmed' | 'failed';

  @ApiProperty()
  explorerUrl: string;

  @ApiProperty()
  createdAt: Date;
}

export class VerifyBlockchainTransactionDto {
  @ApiProperty({ description: 'Blockchain transaction hash' })
  @IsString()
  transactionHash: string;

  @ApiPropertyOptional({ enum: BlockchainNetwork, description: 'Target blockchain network' })
  @IsOptional()
  @IsEnum(BlockchainNetwork)
  network?: BlockchainNetwork;
}

export class BlockchainVerificationResultDto {
  @ApiProperty()
  verified: boolean;

  @ApiProperty()
  transactionHash: string;

  @ApiProperty()
  blockNumber: number;

  @ApiProperty()
  from: string;

  @ApiProperty()
  to: string;

  @ApiProperty()
  value: string;

  @ApiProperty()
  status: 'success' | 'pending' | 'failed';

  @ApiProperty()
  confirmations: number;

  @ApiProperty()
  timestamp: Date;

  @ApiPropertyOptional({ description: 'Error message if verification failed' })
  error?: string;
}

export class SmartContractDeploymentDto {
  @ApiProperty({ description: 'Contract constructor parameters' })
  @IsOptional()
  constructorParams?: any[];

  @ApiPropertyOptional({ description: 'Contract initialization metadata' })
  @IsOptional()
  metadata?: Record<string, any>;
}

export class GetBlockchainStatsDto {
  @ApiProperty()
  totalTransactions: number;

  @ApiProperty()
  confirmedTransactions: number;

  @ApiProperty()
  pendingTransactions: number;

  @ApiProperty()
  failedTransactions: number;

  @ApiProperty()
  totalValue: string;

  @ApiProperty()
  averageGasUsed: string;

  @ApiProperty()
  lastUpdated: Date;
}
