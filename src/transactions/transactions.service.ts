import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { AuthUserPayload } from '../auth/types/auth-user.type';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TransactionStatus, TransactionType, UserRole } from '../types/prisma.types';
import {
  canTransitionTransactionStatus,
  DEFAULT_TRANSACTION_STATUS,
} from './transaction-status.constants';
import {
  CreateTransactionTaxStrategyDto,
  UpdateTransactionTaxStrategyDto,
} from './dto/transaction.dto';

export interface CreateTransactionInput {
  propertyId: string;
  buyerId: string;
  sellerId: string;
  amount: Decimal | number | string;
  type?: TransactionType;
  status?: TransactionStatus;
  blockchainHash?: string | null;
  contractAddress?: string | null;
  notes?: string | null;
}

const TAX_STRATEGY_DISCLAIMER =
  'Informational only. Tax strategy suggestions are non-binding and are not legal or tax advice.';

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async createTransaction(input: CreateTransactionInput, actor?: AuthUserPayload) {
    if (actor && actor.role !== UserRole.ADMIN && actor.sub !== input.buyerId) {
      throw new ForbiddenException('You can only create transactions as the authenticated buyer');
    }

    const [property, buyer, seller] = await Promise.all([
      this.prisma.property.findUnique({
        where: { id: input.propertyId },
        select: {
          id: true,
          title: true,
          address: true,
          ownerId: true,
        },
      }),
      this.prisma.user.findUnique({
        where: { id: input.buyerId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      }),
      this.prisma.user.findUnique({
        where: { id: input.sellerId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      }),
    ]);

    if (!property) {
      throw new NotFoundException(`Property ${input.propertyId} not found`);
    }

    if (!buyer) {
      throw new NotFoundException(`Buyer ${input.buyerId} not found`);
    }

    if (!seller) {
      throw new NotFoundException(`Seller ${input.sellerId} not found`);
    }

    if (property.ownerId !== input.sellerId) {
      throw new BadRequestException('Seller must match the property owner');
    }

    return this.prisma.transaction.create({
      data: {
        propertyId: input.propertyId,
        buyerId: input.buyerId,
        sellerId: input.sellerId,
        amount: new Decimal(input.amount.toString()),
        type: input.type ?? TransactionType.SALE,
        blockchainHash: input.blockchainHash,
        contractAddress: input.contractAddress,
        notes: input.notes,
        status: input.status ?? DEFAULT_TRANSACTION_STATUS,
      },
      include: {
        property: {
          select: {
            id: true,
            title: true,
            address: true,
          },
        },
        buyer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        seller: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });
  }

  async updateStatus(id: string, status: TransactionStatus) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id },
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction with ID ${id} not found`);
    }

    const updated = await this.prisma.transaction.update({
      where: { id },
      data: { status },
    });

    // Trigger notification
    await this.notificationsService.handleTransactionUpdate(id);

    return updated;
  }

  // Alias for AdminService compatibility
  async updateTransactionStatus(id: string, status: TransactionStatus) {
    return this.updateStatus(id, status);
  }

  async findOne(id: string) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id },
      include: {
        buyer: true,
        seller: true,
        property: true,
      },
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction with ID ${id} not found`);
    }

    return transaction;
  }

  async listTaxStrategies(transactionId: string, actor: AuthUserPayload) {
    const transaction = await this.getTransactionForTaxStrategy(transactionId);
    this.assertCanAccessTaxStrategy(transaction, actor);

    return this.prisma.transactionTaxStrategy.findMany({
      where: { transactionId },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async createTaxStrategySuggestion(
    transactionId: string,
    input: CreateTransactionTaxStrategyDto,
    actor: AuthUserPayload,
  ) {
    const transaction = await this.getTransactionForTaxStrategy(transactionId);
    this.assertCanAccessTaxStrategy(transaction, actor);

    const estimatedTaxRate = this.toDecimal(input.estimatedTaxRate);
    const estimatedTaxImpact = this.resolveEstimatedTaxImpact(
      transaction.amount,
      estimatedTaxRate,
      input.estimatedTaxImpact,
    );

    const strategy = await this.prisma.transactionTaxStrategy.create({
      data: {
        transactionId,
        createdById: actor.sub,
        strategyType: input.strategyType.trim(),
        jurisdiction:
          input.jurisdiction?.trim() || this.buildJurisdictionLabel(transaction.property),
        estimatedTaxRate,
        estimatedTaxImpact,
        explanation: input.explanation.trim(),
        metadata: this.buildStrategyMetadata(input.metadata),
        version: input.version ?? 1,
      },
    });

    await this.emitTaxStrategyNotification('created', strategy, transaction, actor.sub);

    return strategy;
  }

  async updateTaxStrategySuggestion(
    transactionId: string,
    strategyId: string,
    input: UpdateTransactionTaxStrategyDto,
    actor: AuthUserPayload,
  ) {
    const transaction = await this.getTransactionForTaxStrategy(transactionId);
    this.assertCanAccessTaxStrategy(transaction, actor);

    const existing = await this.prisma.transactionTaxStrategy.findFirst({
      where: {
        id: strategyId,
        transactionId,
      },
    });

    if (!existing) {
      throw new NotFoundException(`Tax strategy suggestion ${strategyId} not found`);
    }

    const estimatedTaxRate =
      input.estimatedTaxRate !== undefined
        ? this.toDecimal(input.estimatedTaxRate)
        : existing.estimatedTaxRate;
    const estimatedTaxImpact = this.resolveEstimatedTaxImpact(
      transaction.amount,
      estimatedTaxRate,
      input.estimatedTaxImpact !== undefined ? input.estimatedTaxImpact : existing.estimatedTaxImpact,
    );

    const strategy = await this.prisma.transactionTaxStrategy.update({
      where: { id: strategyId },
      data: {
        strategyType: input.strategyType?.trim() ?? existing.strategyType,
        jurisdiction:
          input.jurisdiction !== undefined
            ? input.jurisdiction.trim() || this.buildJurisdictionLabel(transaction.property)
            : existing.jurisdiction,
        estimatedTaxRate,
        estimatedTaxImpact,
        explanation: input.explanation?.trim() ?? existing.explanation,
        metadata:
          input.metadata !== undefined
            ? this.buildStrategyMetadata(input.metadata)
            : existing.metadata ?? this.buildStrategyMetadata(),
        version: input.version ?? existing.version + 1,
      },
    });

    await this.emitTaxStrategyNotification('updated', strategy, transaction, actor.sub);

    return strategy;
  }

  private async getTransactionForTaxStrategy(transactionId: string) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        property: {
          select: {
            id: true,
            city: true,
            state: true,
            country: true,
          },
        },
      },
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction ${transactionId} not found`);
    }

    return transaction;
  }

  private assertCanAccessTaxStrategy(
    transaction: { buyerId: string; sellerId: string },
    actor: AuthUserPayload,
  ) {
    if (
      actor.role !== UserRole.ADMIN &&
      actor.sub !== transaction.buyerId &&
      actor.sub !== transaction.sellerId
    ) {
      throw new ForbiddenException('You are not allowed to manage tax strategy suggestions');
    }
  }

  private buildJurisdictionLabel(property?: {
    city: string | null;
    state: string | null;
    country: string | null;
  } | null) {
    if (!property) {
      return null;
    }

    const parts = [property.city, property.state, property.country]
      .map((part) => part?.trim())
      .filter((part): part is string => Boolean(part));

    return parts.length > 0 ? parts.join(', ') : null;
  }

  private buildStrategyMetadata(metadata?: Record<string, unknown>): Prisma.InputJsonValue {
    return {
      ...(metadata ?? {}),
      disclaimer: TAX_STRATEGY_DISCLAIMER,
    } as Prisma.InputJsonValue;
  }

  private toDecimal(value?: Decimal | number | string | null) {
    if (value === undefined || value === null) {
      return null;
    }

    return new Decimal(value.toString());
  }

  private resolveEstimatedTaxImpact(
    transactionAmount: Decimal,
    estimatedTaxRate?: Decimal | null,
    fallbackImpact?: Decimal | number | string | null,
  ) {
    if (estimatedTaxRate) {
      return transactionAmount.mul(estimatedTaxRate).div(100);
    }

    return this.toDecimal(fallbackImpact);
  }

  private async emitTaxStrategyNotification(
    action: 'created' | 'updated',
    strategy: {
      id: string;
      transactionId: string;
      strategyType: string;
      jurisdiction: string | null;
      version: number;
    },
    transaction: { buyerId: string; sellerId: string },
    actorId: string,
  ) {
    const recipients = new Set([transaction.buyerId, transaction.sellerId]);

    await Promise.all(
      Array.from(recipients).map((userId) =>
        this.notificationsService.sendNotification(
          userId,
          `Tax strategy suggestion ${action}`,
          `A ${strategy.strategyType} tax strategy suggestion was ${action} for transaction ${strategy.transactionId}.`,
          `transaction_tax_strategy_${action}`,
          {
            transactionId: strategy.transactionId,
            strategyId: strategy.id,
            strategyType: strategy.strategyType,
            jurisdiction: strategy.jurisdiction,
            version: strategy.version,
            actorId,
            disclaimer: TAX_STRATEGY_DISCLAIMER,
          },
        ),
      ),
    );
  }
}
