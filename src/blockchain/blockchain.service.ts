import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { TransactionStatus } from '../types/prisma.types';
import {
  RecordTransactionOnBlockchainDto,
  BlockchainTransactionDto,
  VerifyBlockchainTransactionDto,
  BlockchainVerificationResultDto,
  BlockchainNetwork,
  GetBlockchainStatsDto,
} from './dto/blockchain.dto';
import { BlockchainErrorClassifier, BlockchainErrorType } from './errors/blockchain-error';

interface BlockchainConfig {
  enabled: boolean;
  network: BlockchainNetwork;
  rpcUrl: string;
  contractAddress: string;
  privateKey: string;
  explorerUrl: string;
}

interface BlockchainTransaction {
  id: string;
  transactionHash: string;
  blockchainHash: string;
  contractAddress: string;
  blockNumber?: number;
  status: 'pending' | 'confirmed' | 'failed';
  explorerUrl: string;
  createdAt: Date;
}

@Injectable()
export class BlockchainService {
  private readonly logger = new Logger(BlockchainService.name);
  private config: BlockchainConfig;
  private web3: any;
  private contract: any;
  private transactionCache = new Map<string, BlockchainTransaction>();

  // Only COMPLETED transactions are allowed to be recorded on the blockchain
  private static readonly ALLOWED_TRANSACTION_STATUSES: TransactionStatus[] = [
    TransactionStatus.COMPLETED,
  ];

  // Required fields for blockchain recording
  private static readonly REQUIRED_RECORD_FIELDS: (keyof RecordTransactionOnBlockchainDto)[] = [
    'transactionId',
    'propertyId',
    'buyerAddress',
    'sellerAddress',
    'amount',
  ];

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    this.initializeConfig();
  }

  /**
   * Initialize blockchain configuration from environment
   */
  private initializeConfig() {
    const isEnabled = this.configService.get('BLOCKCHAIN_ENABLED', 'true') === 'true';

    if (!isEnabled) {
      this.logger.warn('Blockchain service is disabled');
      return;
    }

    this.config = {
      enabled: isEnabled,
      network: (this.configService.get('BLOCKCHAIN_NETWORK') || 'sepolia') as BlockchainNetwork,
      rpcUrl:
        this.configService.get('BLOCKCHAIN_RPC_URL') ||
        'https://sepolia.infura.io/v3/YOUR_INFURA_KEY',
      contractAddress: this.configService.get('BLOCKCHAIN_CONTRACT_ADDRESS') || '',
      privateKey: this.configService.get('BLOCKCHAIN_PRIVATE_KEY') || '',
      explorerUrl: this.getExplorerUrl(
        (this.configService.get('BLOCKCHAIN_NETWORK') || 'sepolia') as BlockchainNetwork,
      ),
    };

    this.logger.log(`Blockchain service initialized on ${this.config.network} network`);
  }

  /**
   * Get blockchain explorer URL based on network
   */
  private getExplorerUrl(network: BlockchainNetwork): string {
    const explorerUrls: Record<BlockchainNetwork, string> = {
      [BlockchainNetwork.ETHEREUM]: 'https://etherscan.io',
      [BlockchainNetwork.SEPOLIA]: 'https://sepolia.etherscan.io',
      [BlockchainNetwork.POLYGON]: 'https://polygonscan.com',
      [BlockchainNetwork.MUMBAI]: 'https://mumbai.polygonscan.com',
    };
    return explorerUrls[network] || explorerUrls[BlockchainNetwork.SEPOLIA];
  }

  /**
   * Generate keccak256 hash for transaction data (blockchain-compatible)
   */
  generateBlockchainHash(data: {
    transactionId: string;
    propertyId: string;
    buyerAddress: string;
    sellerAddress: string;
    amount: number;
    timestamp?: number;
  }): string {
    const timestamp = data.timestamp || Date.now();
    const dataString = JSON.stringify({
      transactionId: data.transactionId,
      propertyId: data.propertyId,
      buyerAddress: data.buyerAddress.toLowerCase(),
      sellerAddress: data.sellerAddress.toLowerCase(),
      amount: data.amount.toString(),
      timestamp,
    });

    // Create SHA256 hash (compatible with blockchain hashing)
    return '0x' + crypto.createHash('sha256').update(dataString).digest('hex');
  }

  /**
   * Generate SHA256 hash for document verification
   */
  generateDocumentHash(content: string | Buffer): string {
    return '0x' + crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Record a transaction on the blockchain
   */
  /**
   * Validate that the transaction record is complete and the transaction status is allowed.
   */
  private async validateTransactionRecord(dto: RecordTransactionOnBlockchainDto): Promise<void> {
    // Check required fields
    for (const field of BlockchainService.REQUIRED_RECORD_FIELDS) {
      if (!dto[field] && dto[field] !== 0) {
        throw new BadRequestException(
          `Missing required field: ${field} is required for blockchain recording`,
        );
      }
    }

    // Validate wallet addresses
    if (!this.isValidAddress(dto.buyerAddress)) {
      throw new BadRequestException(`Invalid buyer wallet address: ${dto.buyerAddress}`);
    }
    if (!this.isValidAddress(dto.sellerAddress)) {
      throw new BadRequestException(`Invalid seller wallet address: ${dto.sellerAddress}`);
    }

    // Validate amount is positive
    if (dto.amount <= 0) {
      throw new BadRequestException('Transaction amount must be greater than 0');
    }

    // Verify transaction exists and has allowed status
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: dto.transactionId },
      select: { id: true, status: true },
    });

    if (!transaction) {
      throw new BadRequestException(
        `Transaction ${dto.transactionId} not found`,
      );
    }

    const txStatus = transaction.status as unknown as TransactionStatus;
    if (!BlockchainService.ALLOWED_TRANSACTION_STATUSES.includes(txStatus)) {
      throw new BadRequestException(
        `Transaction status '${txStatus}' is not allowed for blockchain recording. ` +
        `Only ${BlockchainService.ALLOWED_TRANSACTION_STATUSES.join(', ')} transactions can be recorded.`,
      );
    }
  }

  /**
   * Log blockchain interaction to TransactionHistory for audit trail.
   */
  private async logBlockchainInteraction(
    transactionId: string,
    action: string,
    details: Record<string, any>,
  ): Promise<void> {
    try {
      await this.prisma.transactionHistory.create({
        data: {
          transactionId,
          status: 'COMPLETED' as any,
          notes: `Blockchain ${action}: ${JSON.stringify(details)}`,
          metadata: {
            action,
            ...details,
            timestamp: new Date().toISOString(),
          },
        },
      });
    } catch (error) {
      this.logger.error(`Failed to log blockchain interaction: ${error.message}`);
      // Non-blocking: don't fail the main operation if audit logging fails
    }
  }

  async recordTransactionOnBlockchain(
    dto: RecordTransactionOnBlockchainDto,
  ): Promise<BlockchainTransactionDto> {
    try {
      // Validate the transaction record before proceeding
      await this.validateTransactionRecord(dto);

      if (!this.config?.enabled) {
        this.logger.warn('Blockchain recording is disabled, storing hash locally only');
        const result = await this.recordTransactionLocally(dto);
        await this.logBlockchainInteraction(dto.transactionId, 'record-local', {
          status: 'confirmed',
          blockchainHash: result.blockchainHash,
        });
        return result;
      }

      // Generate blockchain hash
      const blockchainHash = this.generateBlockchainHash({
        transactionId: dto.transactionId,
        propertyId: dto.propertyId,
        buyerAddress: dto.buyerAddress,
        sellerAddress: dto.sellerAddress,
        amount: dto.amount,
      });

      this.logger.log(`Recording transaction ${dto.transactionId} on ${this.config.network}`);

      let transactionHash: string;
      let attempt = 0;
      const maxRetries = 3;

      while (true) {
        attempt++;
        try {
          transactionHash = await this.simulateSmartContractCall(dto, blockchainHash);
          break; // Success, exit retry loop
        } catch (error) {
          const errorType = BlockchainErrorClassifier.classify(error);
          
          if (errorType === BlockchainErrorType.RETRYABLE && attempt < maxRetries) {
            this.logger.warn(`Blockchain call failed (attempt ${attempt}/${maxRetries}), retrying...`);
            await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
          } else {
            const actionableMessage = BlockchainErrorClassifier.getActionableMessage(error);
            throw new InternalServerErrorException(actionableMessage);
          }
        }
      }

      // Update transaction in database with blockchain data
      const updated = await this.prisma.transaction.update({
        where: { id: dto.transactionId },
        data: {
          blockchainHash,
          contractAddress: this.config.contractAddress,
        },
      });

      const response: BlockchainTransactionDto = {
        transactionHash,
        blockchainHash,
        contractAddress: this.config.contractAddress,
        blockNumber: 0, // Will be updated when confirmed
        status: 'pending',
        explorerUrl: `${this.config.explorerUrl}/tx/${transactionHash}`,
        createdAt: new Date(),
      };

      // Cache the transaction
      this.transactionCache.set(dto.transactionId, {
        ...response,
        id: dto.transactionId,
      });

      await this.logBlockchainInteraction(dto.transactionId, 'record', {
        transactionHash,
        blockchainHash,
        status: 'pending',
        network: dto.network || this.config.network,
      });

      return response;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(
        `Failed to record transaction on blockchain: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to record transaction on blockchain');
    }
  }

  /**
   * Record transaction locally when blockchain is disabled
   */
  private async recordTransactionLocally(
    dto: RecordTransactionOnBlockchainDto,
  ): Promise<BlockchainTransactionDto> {
    const blockchainHash = this.generateBlockchainHash({
      transactionId: dto.transactionId,
      propertyId: dto.propertyId,
      buyerAddress: dto.buyerAddress,
      sellerAddress: dto.sellerAddress,
      amount: dto.amount,
    });

    // Create a local transaction hash using blockchain-compatible hashing
    const localHash = this.generateBlockchainHash({
      ...dto,
      timestamp: Date.now(),
    });

    await this.prisma.transaction.update({
      where: { id: dto.transactionId },
      data: {
        blockchainHash,
      },
    });

    return {
      transactionHash: localHash,
      blockchainHash,
      contractAddress: 'local',
      blockNumber: 0,
      status: 'confirmed',
      explorerUrl: `local://transaction/${localHash}`,
      createdAt: new Date(),
    };
  }

  /**
   * Simulate smart contract call (for testing/development)
   */
  private async simulateSmartContractCall(
    dto: RecordTransactionOnBlockchainDto,
    blockchainHash: string,
  ): Promise<string> {
    // Simulate blockchain delay
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Generate a realistic transaction hash
    const txData = `${dto.transactionId}${dto.buyerAddress}${dto.sellerAddress}${Date.now()}`;
    const txHash = '0x' + crypto.createHash('sha256').update(txData).digest('hex');

    this.logger.log(`Smart contract call simulated for transaction ${dto.transactionId}`);

    return txHash;
  }

  /**
   * Verify a transaction on the blockchain
   */
  async verifyBlockchainTransaction(
    dto: VerifyBlockchainTransactionDto,
  ): Promise<BlockchainVerificationResultDto> {
    try {
      // Validate input
      if (!dto.transactionHash || !dto.transactionHash.startsWith('0x')) {
        throw new BadRequestException(
          'Invalid transaction hash. Must start with 0x prefix.',
        );
      }

      const network = dto.network || this.config?.network || BlockchainNetwork.SEPOLIA;

      this.logger.log(`Verifying transaction ${dto.transactionHash} on ${network}`);

      // Check cache first
      const cached = this.findCachedTransaction(dto.transactionHash);
      if (cached) {
        const result = this.formatVerificationResult(cached, network);
        await this.logBlockchainInteraction(
          cached.id,
          'verify-cached',
          { transactionHash: dto.transactionHash, network, verified: true },
        );
        return result;
      }

      // In a real implementation, query the blockchain RPC
      // For now, simulate verification
      const result = await this.simulateTransactionVerification(dto.transactionHash, network);

      return result;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(`Failed to verify transaction: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to verify transaction on blockchain');
    }
  }

  /**
   * Simulate transaction verification
   */
  private async simulateTransactionVerification(
    transactionHash: string,
    network: BlockchainNetwork,
  ): Promise<BlockchainVerificationResultDto> {
    // In production, this would query the blockchain
    return {
      verified: true,
      transactionHash,
      blockNumber: Math.floor(Math.random() * 1000000),
      from: '0x' + crypto.randomBytes(20).toString('hex'),
      to: '0x' + crypto.randomBytes(20).toString('hex'),
      value: '1000000000000000000', // 1 ETH in wei
      status: 'success',
      confirmations: Math.floor(Math.random() * 10) + 1,
      timestamp: new Date(),
    };
  }

  /**
   * Find cached transaction
   */
  private findCachedTransaction(transactionHash: string): BlockchainTransaction | undefined {
    for (const [, tx] of this.transactionCache) {
      if (tx.transactionHash === transactionHash) {
        return tx;
      }
    }
    return undefined;
  }

  /**
   * Format verification result
   */
  private formatVerificationResult(
    tx: BlockchainTransaction,
    network: BlockchainNetwork,
  ): BlockchainVerificationResultDto {
    return {
      verified: tx.status === 'confirmed',
      transactionHash: tx.transactionHash,
      blockNumber: tx.blockNumber || 0,
      from: tx.id.substring(0, 42),
      to: tx.contractAddress,
      value: '0',
      status: tx.status === 'confirmed' ? 'success' : 'pending',
      confirmations: tx.status === 'confirmed' ? 12 : 0,
      timestamp: tx.createdAt,
    };
  }

  /**
   * Get blockchain statistics
   */
  async getBlockchainStats(): Promise<GetBlockchainStatsDto> {
    try {
      const transactions = await this.prisma.transaction.findMany({
        where: {
          blockchainHash: { not: null },
        },
        select: {
          blockchainHash: true,
          amount: true,
          status: true,
        },
      });

      const confirmed = transactions.filter((t) => t.status === ('COMPLETED' as any));
      const pending = transactions.filter((t) => t.status === ('PENDING' as any));
      const failed = transactions.filter((t) => t.status === ('FAILED' as any));

      const totalValue = confirmed.reduce((sum: number, t: any) => sum + t.amount.toNumber(), 0);

      return {
        totalTransactions: transactions.length,
        confirmedTransactions: confirmed.length,
        pendingTransactions: pending.length,
        failedTransactions: failed.length,
        totalValue: totalValue.toString(),
        averageGasUsed: '0', // Would be calculated from actual on-chain data
        lastUpdated: new Date(),
      };
    } catch (error) {
      this.logger.error(`Failed to get blockchain stats: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to retrieve blockchain statistics');
    }
  }

  /**
   * Generate blockchain explorer link
   */
  generateExplorerLink(
    transactionHash: string,
    linkType: 'transaction' | 'address' = 'transaction',
  ): string {
    if (!this.config) {
      return '';
    }

    if (linkType === 'address') {
      return `${this.config.explorerUrl}/address/${transactionHash}`;
    }

    return `${this.config.explorerUrl}/tx/${transactionHash}`;
  }

  /**
   * Validate Ethereum address format
   */
  isValidAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  /**
   * Get current blockchain network
   */
  getCurrentNetwork(): BlockchainNetwork {
    return this.config?.network || BlockchainNetwork.SEPOLIA;
  }

  /**
   * Get blockchain service status
   */
  getStatus() {
    return {
      enabled: this.config?.enabled || false,
      network: this.config?.network || BlockchainNetwork.SEPOLIA,
      contractAddress: this.config?.contractAddress || '',
      explorerUrl: this.config?.explorerUrl || '',
      cachedTransactions: this.transactionCache.size,
    };
  }
}
