import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { PrismaService } from '../../../src/database/prisma.service';
import type { FeeBreakdown } from '../../../src/transactions/dto/transaction.dto';
import { TransactionFeesService } from '../../../src/transactions/transaction-fees.service';
import {
  CreateEscrowDto,
  DisputeResolution,
  EscrowAuditAction,
  EscrowAuditEntryDto,
  EscrowResponseDto,
  EscrowStatus,
  HoldFundsDto,
} from './dto/escrow-management.dto';

/** Injection token kept local so the module never mutates the Prisma module. */
export const ESCROW_MANAGEMENT_PRISMA = Symbol('ESCROW_MANAGEMENT_PRISMA');

/** Only the delegates this module actually needs. */
export type EscrowPrisma = Pick<PrismaService, 'transaction' | 'transactionHistory'>;

interface EscrowRecord extends EscrowResponseDto {}

/**
 * Self-contained escrow lifecycle service (issue #1611).
 *
 * State machine: PENDING -> HELD -> RELEASED | REFUNDED. A dispute moves a
 * PENDING escrow into HELD and locks it until it is explicitly resolved.
 */
@Injectable()
export class EscrowManagementService implements OnModuleInit {
  private readonly logger = new Logger(EscrowManagementService.name);
  private readonly escrows = new Map<string, EscrowRecord>();

  constructor(
    @Inject(ESCROW_MANAGEMENT_PRISMA) private readonly prisma: EscrowPrisma,
    private readonly fees: TransactionFeesService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      const transactions = await this.prisma.transaction.findMany({
        where: { escrowStatus: { not: null } },
      });
      for (const transaction of transactions) {
        try {
          const history = await this.prisma.transactionHistory.findMany({
            where: { transactionId: transaction.id },
            orderBy: { createdAt: 'desc' },
            take: 1,
          });
          const notes = history[0]?.notes;
          if (!notes) {
            continue;
          }
          const parsed: unknown = JSON.parse(notes);
          const snapshot = (parsed as Record<string, unknown> | null)?.__escrowSnapshot;
          const record = this.reviveSnapshot(snapshot);
          if (!record || record.transactionId !== transaction.id) {
            continue;
          }
          this.escrows.set(record.transactionId, record);
        } catch {
          this.logger.warn(`Skipped malformed escrow snapshot for ${transaction.id}`);
        }
      }
    } catch {
      this.logger.warn('Escrow hydration failed; starting with an empty escrow store');
    }
  }

  /** Create a PENDING escrow and derive its funded amount from transaction fees. */
  async create(dto: CreateEscrowDto, actorId?: string): Promise<EscrowResponseDto> {
    if (!Number.isFinite(dto.amount) || dto.amount <= 0) {
      throw new BadRequestException('Escrow amount must be greater than zero');
    }

    const transaction = await this.prisma.transaction.findUnique({
      where: { id: dto.transactionId },
    });
    if (!transaction) {
      throw new NotFoundException(`Transaction ${dto.transactionId} not found`);
    }
    if (this.escrows.has(dto.transactionId) || transaction.escrowStatus) {
      throw new ConflictException(`Escrow already exists for transaction ${dto.transactionId}`);
    }

    const transactionAmount = Number(transaction.amount);
    if (!Number.isFinite(transactionAmount) || dto.amount > transactionAmount) {
      throw new BadRequestException('Escrow amount cannot exceed the transaction amount');
    }

    const feeBreakdown = this.fees.calculateFees(dto.amount);
    const amount = this.round(feeBreakdown.totalAmount);
    if (!Number.isFinite(amount) || amount > transactionAmount) {
      throw new BadRequestException(
        'Escrow amount including fees cannot exceed the transaction amount',
      );
    }
    const now = new Date();
    const record: EscrowRecord = {
      id: randomUUID(),
      transactionId: dto.transactionId,
      baseAmount: dto.amount,
      amount,
      currency: 'USD',
      status: EscrowStatus.PENDING,
      balance: 0,
      feeBreakdown,
      milestones: dto.milestones ? [...dto.milestones] : [],
      metMilestones: [],
      disputed: false,
      auditTrail: [],
      createdAt: now,
      updatedAt: now,
    };

    this.escrows.set(record.transactionId, record);
    await this.appendAudit(record, EscrowAuditAction.CREATED, actorId);
    await this.syncTransaction(record);
    return this.clone(record);
  }

  /** Move a PENDING escrow into HELD with funds reserved. */
  async holdFunds(
    transactionId: string,
    dto: HoldFundsDto = {},
    actorId?: string,
  ): Promise<EscrowResponseDto> {
    const record = this.getRecord(transactionId);
    if (record.status !== EscrowStatus.PENDING) {
      throw new ConflictException('Only a pending escrow can hold funds');
    }

    const amount = dto.amount ?? record.amount;
    if (!Number.isFinite(amount) || amount <= 0 || amount > record.amount) {
      throw new BadRequestException('Hold amount must be positive and within the escrow amount');
    }

    record.status = EscrowStatus.HELD;
    record.balance = this.round(amount);
    record.updatedAt = new Date();
    await this.appendAudit(record, EscrowAuditAction.FUNDS_HELD, actorId, `${record.balance}`);
    await this.syncTransaction(record);
    return this.clone(record);
  }

  /** Mark one required transaction milestone as complete. */
  async markMilestoneComplete(
    transactionId: string,
    milestoneId: string,
    actorId?: string,
  ): Promise<EscrowResponseDto> {
    const record = this.getRecord(transactionId);
    if (record.status !== EscrowStatus.HELD) {
      throw new ConflictException('Milestones can only be completed while funds are held');
    }
    if (record.disputed) {
      throw new ConflictException('Cannot complete milestones during a dispute hold');
    }
    if (!record.milestones.includes(milestoneId)) {
      throw new BadRequestException(`Milestone ${milestoneId} is not required for this escrow`);
    }
    if (!record.metMilestones.includes(milestoneId)) {
      record.metMilestones.push(milestoneId);
      record.updatedAt = new Date();
      await this.appendAudit(record, EscrowAuditAction.MILESTONE_COMPLETED, actorId, milestoneId);
    }
    return this.clone(record);
  }

  /** Conditionally release funds once every milestone is complete. */
  async release(transactionId: string, actorId?: string): Promise<EscrowResponseDto> {
    const record = this.getRecord(transactionId);
    if (record.status === EscrowStatus.RELEASED) {
      throw new ConflictException('Escrow has already been released');
    }
    if (record.status === EscrowStatus.REFUNDED) {
      throw new ConflictException('Refunded escrow cannot be released');
    }
    if (record.status !== EscrowStatus.HELD) {
      throw new ConflictException('Only a held escrow can be released');
    }
    if (record.disputed) {
      throw new ConflictException('Disputed escrow must be resolved before release');
    }

    const outstanding = record.milestones.filter(
      (milestone) => !record.metMilestones.includes(milestone),
    );
    if (outstanding.length > 0) {
      throw new BadRequestException(
        `Cannot release escrow before milestones are complete: ${outstanding.join(', ')}`,
      );
    }

    record.status = EscrowStatus.RELEASED;
    record.balance = 0;
    record.releasedAt = new Date();
    record.updatedAt = record.releasedAt;
    await this.appendAudit(record, EscrowAuditAction.RELEASED, actorId);
    await this.syncTransaction(record);
    return this.clone(record);
  }

  /** Refund the buyer and close the escrow with a full audit trail. */
  async refund(
    transactionId: string,
    reason: string,
    actorId?: string,
  ): Promise<EscrowResponseDto> {
    const record = this.getRecord(transactionId);
    if (record.status === EscrowStatus.REFUNDED) {
      throw new ConflictException('Escrow has already been refunded');
    }
    if (record.status === EscrowStatus.RELEASED) {
      throw new ConflictException('Released escrow cannot be refunded');
    }

    record.disputed = false;
    record.disputeReason = undefined;
    record.status = EscrowStatus.REFUNDED;
    record.balance = 0;
    record.refundedAt = new Date();
    record.updatedAt = record.refundedAt;
    await this.appendAudit(record, EscrowAuditAction.REFUNDED, actorId, reason);
    await this.syncTransaction(record);
    return this.clone(record);
  }

  /** A dispute triggers (or reinforces) a hold on the escrowed funds. */
  async placeDisputeHold(
    transactionId: string,
    reason: string,
    actorId?: string,
  ): Promise<EscrowResponseDto> {
    const record = this.getRecord(transactionId);
    if (record.status === EscrowStatus.RELEASED || record.status === EscrowStatus.REFUNDED) {
      throw new ConflictException('A closed escrow cannot be disputed');
    }
    if (record.disputed) {
      throw new ConflictException('Escrow is already under a dispute hold');
    }

    if (record.status === EscrowStatus.PENDING) {
      record.status = EscrowStatus.HELD;
      record.balance = record.amount;
      await this.appendAudit(
        record,
        EscrowAuditAction.FUNDS_HELD,
        actorId,
        'Funds held by dispute',
      );
    }

    record.disputed = true;
    record.disputeReason = reason;
    record.updatedAt = new Date();
    await this.appendAudit(record, EscrowAuditAction.DISPUTE_HOLD, actorId, reason);
    await this.syncTransaction(record);
    return this.clone(record);
  }

  /** Resolve a dispute hold by releasing or refunding the escrow. */
  async resolveDispute(
    transactionId: string,
    resolution: DisputeResolution,
    actorId?: string,
  ): Promise<EscrowResponseDto> {
    const record = this.getRecord(transactionId);
    if (!record.disputed) {
      throw new ConflictException('Escrow is not under a dispute hold');
    }
    if (!Object.values(DisputeResolution).includes(resolution)) {
      throw new BadRequestException('Unknown dispute resolution');
    }

    record.disputed = false;
    record.disputeReason = undefined;
    await this.appendAudit(record, EscrowAuditAction.DISPUTE_RESOLVED, actorId, resolution);

    return resolution === DisputeResolution.RELEASE
      ? this.release(transactionId, actorId)
      : this.refund(transactionId, 'Dispute resolved in favour of the buyer', actorId);
  }

  findAll(transactionId?: string): EscrowResponseDto[] {
    return Array.from(this.escrows.values())
      .filter((record) => !transactionId || record.transactionId === transactionId)
      .map((record) => this.clone(record));
  }

  async findOne(transactionId: string): Promise<EscrowResponseDto> {
    return this.clone(this.getRecord(transactionId));
  }

  async getBalance(transactionId: string): Promise<number> {
    return this.getRecord(transactionId).balance;
  }

  async getAuditTrail(transactionId: string): Promise<EscrowAuditEntryDto[]> {
    return this.getRecord(transactionId).auditTrail.map((entry) => ({ ...entry }));
  }

  async getFeeBreakdown(transactionId: string): Promise<FeeBreakdown> {
    return { ...this.getRecord(transactionId).feeBreakdown };
  }

  private getRecord(transactionId: string): EscrowRecord {
    const record = this.escrows.get(transactionId);
    if (!record) {
      throw new NotFoundException(`Escrow for transaction ${transactionId} not found`);
    }
    return record;
  }

  private async appendAudit(
    record: EscrowRecord,
    action: EscrowAuditAction,
    actorId?: string,
    details?: string,
  ): Promise<void> {
    record.auditTrail.push({
      action,
      actorId,
      details,
      recordedAt: new Date(),
    });
    await this.prisma.transactionHistory.create({
      data: {
        transactionId: record.transactionId,
        status: 'PENDING',
        actorId: actorId ?? null,
        notes: JSON.stringify({
          action,
          details: details ?? null,
          __escrowSnapshot: {
            ...record,
            feeBreakdown: { ...record.feeBreakdown },
            milestones: [...record.milestones],
            metMilestones: [...record.metMilestones],
            auditTrail: record.auditTrail.map((entry) => ({ ...entry })),
          },
        }),
        metadata: { action },
      },
    });
  }

  /** Mirror the escrow state onto the existing transaction record. */
  private async syncTransaction(record: EscrowRecord): Promise<void> {
    await this.prisma.transaction.update({
      where: { id: record.transactionId },
      data: {
        escrowStatus: record.status,
        escrowAmount:
          record.status === EscrowStatus.RELEASED || record.status === EscrowStatus.REFUNDED
            ? 0
            : record.balance || record.amount,
        escrowReleasedAt: record.releasedAt ?? null,
      },
    });
  }

  private reviveSnapshot(value: unknown): EscrowRecord | null {
    if (!value || typeof value !== 'object') {
      return null;
    }
    const raw = value as Record<string, unknown>;
    if (
      typeof raw.id !== 'string' ||
      typeof raw.transactionId !== 'string' ||
      !Object.values(EscrowStatus).includes(raw.status as EscrowStatus) ||
      typeof raw.amount !== 'number' ||
      !Number.isFinite(raw.amount) ||
      typeof raw.balance !== 'number' ||
      !Number.isFinite(raw.balance) ||
      typeof raw.baseAmount !== 'number' ||
      !Number.isFinite(raw.baseAmount) ||
      !raw.feeBreakdown ||
      typeof raw.feeBreakdown !== 'object' ||
      !Array.isArray(raw.milestones) ||
      !Array.isArray(raw.metMilestones) ||
      !Array.isArray(raw.auditTrail)
    ) {
      return null;
    }

    const createdAt = this.reviveDate(raw.createdAt);
    const updatedAt = this.reviveDate(raw.updatedAt);
    if (!createdAt || !updatedAt) {
      return null;
    }

    return {
      id: raw.id,
      transactionId: raw.transactionId,
      baseAmount: raw.baseAmount,
      amount: raw.amount,
      currency: typeof raw.currency === 'string' ? raw.currency : 'USD',
      status: raw.status as EscrowStatus,
      balance: raw.balance,
      feeBreakdown: raw.feeBreakdown as FeeBreakdown,
      milestones: raw.milestones.map(String),
      metMilestones: raw.metMilestones.map(String),
      disputed: raw.disputed === true,
      disputeReason: typeof raw.disputeReason === 'string' ? raw.disputeReason : undefined,
      auditTrail: raw.auditTrail
        .map((entry) => this.reviveAuditEntry(entry))
        .filter((entry): entry is EscrowAuditEntryDto => entry !== null),
      createdAt,
      updatedAt,
      releasedAt: this.reviveDate(raw.releasedAt),
      refundedAt: this.reviveDate(raw.refundedAt),
    };
  }

  private reviveAuditEntry(value: unknown): EscrowAuditEntryDto | null {
    if (!value || typeof value !== 'object') {
      return null;
    }
    const raw = value as Record<string, unknown>;
    const recordedAt = this.reviveDate(raw.recordedAt);
    if (
      !recordedAt ||
      !Object.values(EscrowAuditAction).includes(raw.action as EscrowAuditAction)
    ) {
      return null;
    }
    return {
      action: raw.action as EscrowAuditAction,
      actorId: typeof raw.actorId === 'string' ? raw.actorId : undefined,
      details: typeof raw.details === 'string' ? raw.details : undefined,
      recordedAt,
    };
  }

  private reviveDate(value: unknown): Date | undefined {
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? undefined : value;
    }
    if (typeof value === 'string' || typeof value === 'number') {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? undefined : date;
    }
    return undefined;
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private clone(record: EscrowRecord): EscrowResponseDto {
    return {
      ...record,
      feeBreakdown: { ...record.feeBreakdown },
      milestones: [...record.milestones],
      metMilestones: [...record.metMilestones],
      auditTrail: record.auditTrail.map((entry) => ({ ...entry })),
    };
  }
}
