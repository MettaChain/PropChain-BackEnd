import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { BlockchainService } from '../blockchain/blockchain.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CommissionsService } from '../commissions/commissions.service';
import { TransactionFeesService } from './transaction-fees.service';
import { TimelineService } from './timeline.service';
import { TransactionAuditService } from './transaction-audit.service';
import { canTransitionTransactionStatus } from './transaction-status.constants';
import { TransactionStatus } from '../types/prisma.types';
import {
  CreateTransactionDto,
  UpdateTransactionDto,
  RecordTransactionOnChainDto,
  TransactionResponseDto,
  TransactionListQueryDto,
  TransactionStatusDto,
  TransactionTypeDto,
  TransactionAnalyticsDto,
  TransactionAnalyticsGranularity,
  TransactionAnalyticsQueryDto,
} from './dto/transaction.dto';

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(
    private prisma: PrismaService,
    private blockchainService: BlockchainService,
    private notificationsService: NotificationsService,
    private commissionsService: CommissionsService,
    private transactionFeesService: TransactionFeesService,
    private timelineService: TimelineService,
    private transactionAuditService: TransactionAuditService,
  ) {}

  /**
   * Create a new transaction
   */
  async create(dto: CreateTransactionDto): Promise<TransactionResponseDto> {
    try {
      // Validate that property and users exist
      const [property, buyer, seller] = await Promise.all([
        this.prisma.property.findUnique({ where: { id: dto.propertyId } }),
        this.prisma.user.findUnique({ where: { id: dto.buyerId } }),
        this.prisma.user.findUnique({ where: { id: dto.sellerId } }),
      ]);

      if (!property) {
        throw new NotFoundException('Property not found');
      }
      if (!buyer) {
        throw new NotFoundException('Buyer not found');
      }
      if (!seller) {
        throw new NotFoundException('Seller not found');
      }

      const feeBreakdown = this.transactionFeesService.calculateFees(Number(dto.amount));

      const transaction = await this.prisma.transaction.create({
        data: {
          propertyId: dto.propertyId,
          buyerId: dto.buyerId,
          sellerId: dto.sellerId,
          amount: dto.amount,
          type: dto.type as any,
          status: 'PENDING',
          notes: dto.notes,
          feeBreakdown: feeBreakdown as any,
        },
      });

      await this.commissionsService.createCommissionsForTransaction(transaction.id);

      this.logger.log(`Transaction created: ${transaction.id}`);
      return this.toResponseDto(transaction);
    } catch (error) {
      this.logger.error(`Failed to create transaction: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Find all transactions with filtering and pagination
   */
  async findAll(query: TransactionListQueryDto) {
    try {
      const page = query.page ?? 1;
      const limit = query.limit ?? 20;
      const skip = (page - 1) * limit;

      const where: any = {};
      if (query.propertyId) where.propertyId = query.propertyId;
      if (query.buyerId) where.buyerId = query.buyerId;
      if (query.sellerId) where.sellerId = query.sellerId;
      if (query.status) where.status = query.status;
      if (query.type) where.type = query.type;

      const [transactions, total] = await Promise.all([
        this.prisma.transaction.findMany({
          where,
          skip,
          take: limit,
          include: {
            property: { select: { id: true, title: true, address: true } },
            buyer: { select: { id: true, email: true, firstName: true, lastName: true } },
            seller: { select: { id: true, email: true, firstName: true, lastName: true } },
          },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.transaction.count({ where }),
      ]);

      return {
        total,
        page,
        limit,
        items: transactions.map((t: any) => this.toResponseDto(t)),
      };
    } catch (error) {
      this.logger.error(`Failed to list transactions: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Find a single transaction by ID
   */
  async findOne(id: string): Promise<TransactionResponseDto> {
    try {
      const transaction = await this.prisma.transaction.findUnique({
        where: { id },
        include: {
          property: { select: { id: true, title: true, address: true } },
          buyer: { select: { id: true, email: true, firstName: true, lastName: true } },
          seller: { select: { id: true, email: true, firstName: true, lastName: true } },
        },
      });

      if (!transaction) {
        throw new NotFoundException('Transaction not found');
      }

      return this.toResponseDto(transaction);
    } catch (error) {
      this.logger.error(`Failed to find transaction ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Update a transaction
   */
  async update(id: string, dto: UpdateTransactionDto): Promise<TransactionResponseDto> {
    try {
      const transaction = await this.prisma.transaction.findUnique({
        where: { id },
      });

      if (!transaction) {
        throw new NotFoundException('Transaction not found');
      }

      const updated = await this.prisma.transaction.update({
        where: { id },
        data: {
          status: dto.status as any,
          notes: dto.notes,
        },
      });

      if (dto.status) {
        await this.commissionsService.updateCommissionsStatus(id, dto.status);
      }

      this.logger.log(`Transaction updated: ${id}`);
      return this.toResponseDto(updated);
    } catch (error) {
      this.logger.error(`Failed to update transaction ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Record transaction on blockchain
   */
  async recordOnBlockchain(id: string, dto: RecordTransactionOnChainDto): Promise<any> {
    try {
      const transaction = await this.prisma.transaction.findUnique({
        where: { id },
        include: {
          buyer: true,
          seller: true,
          property: true,
        },
      });

      if (!transaction) {
        throw new NotFoundException('Transaction not found');
      }

      if (transaction.blockchainHash) {
        throw new BadRequestException('Transaction already recorded on blockchain');
      }

      // Get wallet addresses - use provided or fallback to placeholder
      const buyerAddress = dto.buyerAddress || `0x${transaction.buyerId.substring(0, 40)}`;

      const sellerAddress = dto.sellerAddress || `0x${transaction.sellerId.substring(0, 40)}`;

      // Validate addresses
      if (
        !this.blockchainService.isValidAddress(buyerAddress) ||
        !this.blockchainService.isValidAddress(sellerAddress)
      ) {
        this.logger.warn(`Invalid addresses for transaction ${id}. Using fallback hashing.`);
      }

      // Record on blockchain
      const blockchainRecord = await this.blockchainService.recordTransactionOnBlockchain({
        transactionId: id,
        propertyId: transaction.propertyId,
        buyerAddress,
        sellerAddress,
        amount: transaction.amount.toNumber(),
        metadata: {
          transactionType: transaction.type,
          propertyAddress: transaction.property?.address,
        },
      });

      // Update transaction with blockchain data
      const updated = await this.prisma.transaction.update({
        where: { id },
        data: {
          blockchainHash: blockchainRecord.blockchainHash,
          contractAddress: blockchainRecord.contractAddress,
        },
      });

      this.logger.log(
        `Transaction ${id} recorded on blockchain: ${blockchainRecord.blockchainHash}`,
      );

      return {
        transaction: this.toResponseDto(updated),
        blockchain: blockchainRecord,
      };
    } catch (error) {
      this.logger.error(
        `Failed to record transaction on blockchain: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Verify transaction on blockchain
   */
  async verifyOnBlockchain(id: string): Promise<any> {
    try {
      const transaction = await this.prisma.transaction.findUnique({
        where: { id },
      });

      if (!transaction) {
        throw new NotFoundException('Transaction not found');
      }

      if (!transaction.blockchainHash) {
        throw new BadRequestException('Transaction not recorded on blockchain');
      }

      const verification = await this.blockchainService.verifyBlockchainTransaction({
        transactionHash: transaction.blockchainHash,
      });

      // Update transaction status if verified and not already completed
      if (verification.verified && verification.status === 'success') {
        await this.prisma.transaction.update({
          where: { id },
          data: {
            status: 'COMPLETED',
          },
        });
        await this.commissionsService.updateCommissionsStatus(id, 'COMPLETED');
      }

      this.logger.log(`Transaction ${id} verification result: ${verification.verified}`);

      return verification;
    } catch (error) {
      this.logger.error(
        `Failed to verify transaction on blockchain: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get blockchain statistics for transactions
   */
  async getBlockchainStats() {
    return this.blockchainService.getBlockchainStats();
  }

  /**
   * Get transaction analytics for operational dashboards.
   */
  async getAnalytics(query: TransactionAnalyticsQueryDto = {}): Promise<TransactionAnalyticsDto> {
    const where: Record<string, any> = {};

    if (query.type) {
      where.type = query.type;
    }

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = query.startDate;
      if (query.endDate) where.createdAt.lte = query.endDate;
    }

    const transactions = await this.prisma.transaction.findMany({
      where,
      select: {
        amount: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const totalTransactions = transactions.length;
    const completedTransactions = transactions.filter((t: any) => t.status === 'COMPLETED');
    const pendingTransactions = transactions.filter((t: any) => t.status === 'PENDING').length;
    const cancelledTransactions = transactions.filter((t: any) => t.status === 'CANCELLED').length;

    const totalVolume = this.roundCurrency(
      transactions.reduce((sum: number, transaction: any) => {
        return sum + this.toNumber(transaction.amount);
      }, 0),
    );
    const revenue = this.roundCurrency(
      completedTransactions.reduce((sum: number, transaction: any) => {
        return sum + this.toNumber(transaction.amount);
      }, 0),
    );

    return {
      totalTransactions,
      completedTransactions: completedTransactions.length,
      pendingTransactions,
      cancelledTransactions,
      totalVolume,
      averagePrice: totalTransactions > 0 ? this.roundCurrency(totalVolume / totalTransactions) : 0,
      completionRate:
        totalTransactions > 0
          ? this.roundPercentage((completedTransactions.length / totalTransactions) * 100)
          : 0,
      revenue,
      volumeTrends: this.buildVolumeTrends(
        transactions,
        query.granularity ?? TransactionAnalyticsGranularity.MONTH,
      ),
    };
  }

  /**
   * Update transaction status
   */
  async updateTransactionStatus(
    transactionId: string,
    status: string,
    actorId?: string,
  ): Promise<TransactionResponseDto> {
    try {
      const transaction = await this.prisma.transaction.findUnique({
        where: { id: transactionId },
      });

      if (!transaction) {
        throw new NotFoundException('Transaction not found');
      }

      // Enforce status lifecycle (#557)
      const currentStatus = transaction.status as TransactionStatus;
      const nextStatus = status as TransactionStatus;
      if (!canTransitionTransactionStatus(currentStatus, nextStatus)) {
        throw new BadRequestException(
          `Invalid status transition from "${currentStatus}" to "${nextStatus}"`,
        );
      }

      const updated = await this.prisma.transaction.update({
        where: { id: transactionId },
        data: { status: status as any },
      });

      // Audit log the transition (#557)
      await this.transactionAuditService.log(
        transactionId,
        'STATUS_TRANSITION',
        { status: currentStatus },
        { status: nextStatus },
        { actorId },
      );

      await this.commissionsService.updateCommissionsStatus(transactionId, status);

      // Auto-create timeline stage event (#560)
      await this.timelineService.addStageEvent(transactionId, status);

      this.logger.log(`Transaction ${transactionId} status updated to ${status}`);
      return this.toResponseDto(updated);
    } catch (error) {
      this.logger.error(`Failed to update transaction status: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Create a transaction with owner validation (test API)
   */
  async createTransaction(
    dto: {
      propertyId: string;
      buyerId: string;
      sellerId: string;
      amount: number;
      type: string;
    },
    user: { sub: string; email: string; role: string; type: string },
  ): Promise<any> {
    const [property, buyer, seller] = await Promise.all([
      this.prisma.property.findUnique({ where: { id: dto.propertyId } }),
      this.prisma.user.findUnique({ where: { id: dto.buyerId } }),
      this.prisma.user.findUnique({ where: { id: dto.sellerId } }),
    ]);

    if (!property) throw new NotFoundException('Property not found');
    if (!buyer) throw new NotFoundException('Buyer not found');
    if (!seller) throw new NotFoundException('Seller not found');

    const transaction = await this.prisma.transaction.create({
      data: {
        propertyId: dto.propertyId,
        buyerId: dto.buyerId,
        sellerId: dto.sellerId,
        amount: dto.amount,
        type: dto.type as any,
        status: 'PENDING',
      },
      include: {
        property: { select: { id: true, title: true, address: true } },
        buyer: { select: { id: true, firstName: true, lastName: true, email: true } },
        seller: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    await this.commissionsService.createCommissionsForTransaction(transaction.id);

    return transaction;
  }

  /**
   * Create a tax strategy suggestion
   */
  async createTaxStrategySuggestion(
    transactionId: string,
    dto: {
      strategyType: string;
      estimatedTaxRate?: number;
      explanation?: string;
      metadata?: Record<string, any>;
    },
    user: { sub: string; email: string; role: string; type: string },
  ): Promise<any> {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { property: { select: { id: true, city: true, state: true, country: true } } },
    });

    if (!transaction) throw new NotFoundException('Transaction not found');

    const jurisdiction = [
      transaction.property?.city,
      transaction.property?.state,
      transaction.property?.country,
    ]
      .filter(Boolean)
      .join(', ');

    return this.prisma.transactionTaxStrategy
      .create({
        data: {
          transactionId,
          createdById: user.sub,
          strategyType: dto.strategyType,
          jurisdiction: jurisdiction || 'Unknown',
          explanation: dto.explanation ?? '',
          version: 1,
        },
      })
      .then((result: any) => {
        this.notificationsService.sendNotification(
          user.sub,
          'Tax Strategy Created',
          `Tax strategy "${dto.strategyType}" created for transaction ${transactionId}`,
          'TAX_STRATEGY_CREATED',
          result,
        );
        this.notificationsService.sendNotification(
          transaction.buyerId,
          'Tax Strategy Created',
          `A tax strategy was created for your transaction ${transactionId}`,
          'TAX_STRATEGY_CREATED',
          result,
        );
        return result;
      });
  }

  /**
   * Update a tax strategy suggestion
   */
  async updateTaxStrategySuggestion(
    transactionId: string,
    strategyId: string,
    dto: {
      strategyType?: string;
      jurisdiction?: string;
    },
    user: { sub: string; email: string; role: string; type: string },
  ): Promise<any> {
    const existing = await this.prisma.transactionTaxStrategy.findFirst({
      where: { id: strategyId, transactionId },
    });

    if (!existing) throw new NotFoundException('Tax strategy not found');

    return this.prisma.transactionTaxStrategy.update({
      where: { id: strategyId },
      data: {
        ...(dto.strategyType && { strategyType: dto.strategyType }),
        ...(dto.jurisdiction && { jurisdiction: dto.jurisdiction }),
        version: (existing as any).version + 1,
      },
    });
  }

  /**
   * Convert transaction to response DTO
   */
  async updateEscrow(transactionId: string, dto: any, actorId?: string) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
    });
    if (!transaction) throw new NotFoundException('Transaction not found');

    const data: any = {};
    if (dto.escrowStatus !== undefined) data.escrowStatus = dto.escrowStatus;
    if (dto.escrowAmount !== undefined) data.escrowAmount = dto.escrowAmount;
    if (dto.paymentStatus !== undefined) data.paymentStatus = dto.paymentStatus;
    if (dto.escrowStatus === 'RELEASED') data.escrowReleasedAt = new Date();

    const updated = await this.prisma.transaction.update({
      where: { id: transactionId },
      data,
    });

    if (dto.escrowStatus === 'RELEASED' || dto.paymentStatus === 'COMPLETE') {
      await this.notificationsService.sendNotification(
        transaction.buyerId,
        'Payment Milestone Update',
        `Escrow/payment milestone reached for transaction ${transactionId}`,
        'TRANSACTION_UPDATE',
        { transactionId, escrowStatus: dto.escrowStatus, paymentStatus: dto.paymentStatus },
      );
    }

    return this.toResponseDto(updated);
  }

  private toResponseDto(transaction: any): TransactionResponseDto {
    return {
      id: transaction.id,
      propertyId: transaction.propertyId,
      buyerId: transaction.buyerId,
      sellerId: transaction.sellerId,
      amount: transaction.amount,
      type: transaction.type as TransactionTypeDto,
      status: transaction.status as TransactionStatusDto,
      blockchainHash: transaction.blockchainHash,
      contractAddress: transaction.contractAddress,
      notes: transaction.notes,
      feeBreakdown: transaction.feeBreakdown ?? undefined,
      escrowStatus: transaction.escrowStatus ?? undefined,
      escrowAmount: transaction.escrowAmount ?? undefined,
      paymentStatus: transaction.paymentStatus ?? undefined,
      createdAt: transaction.createdAt,
      updatedAt: transaction.updatedAt,
    };
  }

  private buildVolumeTrends(
    transactions: Array<{ amount: unknown; status: string; createdAt: Date }>,
    granularity: TransactionAnalyticsGranularity,
  ) {
    const buckets = new Map<
      string,
      {
        transactionCount: number;
        totalVolume: number;
        completedCount: number;
        revenue: number;
      }
    >();

    for (const transaction of transactions) {
      const period = this.formatAnalyticsPeriod(transaction.createdAt, granularity);
      const amount = this.toNumber(transaction.amount);
      const bucket = buckets.get(period) ?? {
        transactionCount: 0,
        totalVolume: 0,
        completedCount: 0,
        revenue: 0,
      };

      bucket.transactionCount += 1;
      bucket.totalVolume += amount;

      if (transaction.status === 'COMPLETED') {
        bucket.completedCount += 1;
        bucket.revenue += amount;
      }

      buckets.set(period, bucket);
    }

    return [...buckets.entries()].map(([period, bucket]) => ({
      period,
      transactionCount: bucket.transactionCount,
      totalVolume: this.roundCurrency(bucket.totalVolume),
      completedCount: bucket.completedCount,
      revenue: this.roundCurrency(bucket.revenue),
    }));
  }

  private formatAnalyticsPeriod(date: Date, granularity: TransactionAnalyticsGranularity): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');

    if (granularity === TransactionAnalyticsGranularity.DAY) {
      return `${year}-${month}-${day}`;
    }

    if (granularity === TransactionAnalyticsGranularity.WEEK) {
      const week = this.getIsoWeek(date);
      return `${week.year}-W${String(week.week).padStart(2, '0')}`;
    }

    return `${year}-${month}`;
  }

  private getIsoWeek(date: Date): { year: number; week: number } {
    const normalized = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
    const day = normalized.getUTCDay() || 7;
    normalized.setUTCDate(normalized.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(normalized.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((normalized.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);

    return { year: normalized.getUTCFullYear(), week };
  }

  private toNumber(value: unknown): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return Number(value);
    if (value && typeof (value as { toNumber?: unknown }).toNumber === 'function') {
      return (value as { toNumber: () => number }).toNumber();
    }
    if (value && typeof (value as { toString?: unknown }).toString === 'function') {
      return Number((value as { toString: () => string }).toString());
    }

    return 0;
  }

  private roundCurrency(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private roundPercentage(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
