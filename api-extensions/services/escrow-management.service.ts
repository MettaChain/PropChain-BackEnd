import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PrismaService } from '../../src/database/prisma.service';

export const ESCROW_PRISMA_SERVICE = Symbol('ESCROW_PRISMA_SERVICE');

export enum EscrowStatus {
  HELD = 'HELD',
  RELEASED = 'RELEASED',
  REFUNDED = 'REFUNDED',
}

export type EscrowCondition = 'DOCUMENTS_VERIFIED' | 'INSPECTION_PASSED' | 'TITLE_TRANSFERRED';

export type EscrowAuditAction =
  'CREATED' | 'FUNDS_HELD' | 'CONDITION_MET' | 'RELEASED' | 'REFUNDED';

export interface CreateEscrowInput {
  transactionId: string;
  amount: number;
  conditions?: EscrowCondition[];
  actorId?: string;
}

export interface ReleaseEscrowInput {
  transactionId: string;
  actorId?: string;
}

export interface RefundEscrowInput {
  transactionId: string;
  reason: string;
  actorId?: string;
}

export interface EscrowAuditEntry {
  action: EscrowAuditAction;
  actorId?: string;
  details?: string;
  recordedAt: Date;
}

export interface EscrowRecord {
  transactionId: string;
  amount: number;
  status: EscrowStatus;
  conditions: EscrowCondition[];
  metConditions: EscrowCondition[];
  balance: number;
  auditTrail: EscrowAuditEntry[];
  createdAt: Date;
  updatedAt: Date;
  releasedAt?: Date;
  refundedAt?: Date;
}

@Injectable()
export class EscrowManagementService {
  private readonly escrows = new Map<string, EscrowRecord>();

  constructor(@Inject(ESCROW_PRISMA_SERVICE) private readonly prisma: PrismaService) {}

  async create(input: CreateEscrowInput): Promise<EscrowRecord> {
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      throw new BadRequestException('Escrow amount must be greater than zero');
    }

    const transaction = await this.prisma.transaction.findUnique({
      where: { id: input.transactionId },
    });
    if (!transaction) {
      throw new NotFoundException(`Transaction ${input.transactionId} not found`);
    }
    if (this.escrows.has(input.transactionId)) {
      throw new ConflictException(`Escrow already exists for transaction ${input.transactionId}`);
    }
    if (input.amount > Number(transaction.amount)) {
      throw new BadRequestException('Escrow amount cannot exceed the transaction amount');
    }

    const now = new Date();
    const record: EscrowRecord = {
      transactionId: input.transactionId,
      amount: input.amount,
      status: EscrowStatus.HELD,
      conditions: input.conditions ? [...input.conditions] : [],
      metConditions: [],
      balance: input.amount,
      auditTrail: [],
      createdAt: now,
      updatedAt: now,
    };
    this.escrows.set(record.transactionId, record);
    await this.appendAudit(record, 'CREATED', input.actorId);
    await this.appendAudit(record, 'FUNDS_HELD', input.actorId);
    return this.clone(record);
  }

  async findOne(transactionId: string): Promise<EscrowRecord> {
    return this.clone(this.getRecord(transactionId));
  }

  async getBalance(transactionId: string): Promise<number> {
    return this.getRecord(transactionId).balance;
  }

  async getAuditTrail(transactionId: string): Promise<EscrowAuditEntry[]> {
    return this.getRecord(transactionId).auditTrail.map((entry) => ({ ...entry }));
  }

  async markConditionMet(
    transactionId: string,
    condition: EscrowCondition,
    actorId?: string,
  ): Promise<EscrowRecord> {
    const record = this.getRecord(transactionId);
    if (record.status !== EscrowStatus.HELD) {
      throw new ConflictException('Escrow conditions can only be met while funds are held');
    }
    if (!record.conditions.includes(condition)) {
      throw new BadRequestException(`Condition ${condition} is not required for this escrow`);
    }
    if (!record.metConditions.includes(condition)) {
      record.metConditions.push(condition);
      record.updatedAt = new Date();
      await this.appendAudit(record, 'CONDITION_MET', actorId, condition);
    }
    return this.clone(record);
  }

  async release(input: ReleaseEscrowInput): Promise<EscrowRecord> {
    const record = this.getRecord(input.transactionId);
    if (record.status === EscrowStatus.RELEASED) {
      throw new ConflictException('Escrow has already been released');
    }
    if (record.status === EscrowStatus.REFUNDED) {
      throw new ConflictException('Refunded escrow cannot be released');
    }

    const outstanding = record.conditions.filter(
      (condition) => !record.metConditions.includes(condition),
    );
    if (outstanding.length > 0) {
      throw new BadRequestException(
        `Cannot release escrow before conditions are met: ${outstanding.join(', ')}`,
      );
    }

    record.status = EscrowStatus.RELEASED;
    record.balance = 0;
    record.releasedAt = new Date();
    record.updatedAt = record.releasedAt;
    await this.appendAudit(record, 'RELEASED', input.actorId);
    return this.clone(record);
  }

  async refund(input: RefundEscrowInput): Promise<EscrowRecord> {
    const record = this.getRecord(input.transactionId);
    if (record.status === EscrowStatus.REFUNDED) {
      throw new ConflictException('Escrow has already been refunded');
    }
    if (record.status === EscrowStatus.RELEASED) {
      throw new ConflictException('Released escrow cannot be refunded');
    }

    record.status = EscrowStatus.REFUNDED;
    record.balance = 0;
    record.refundedAt = new Date();
    record.updatedAt = record.refundedAt;
    await this.appendAudit(record, 'REFUNDED', input.actorId, input.reason);
    return this.clone(record);
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
        notes: JSON.stringify({ action, details: details ?? null }),
        metadata: { action },
      },
    });
  }

  private clone(record: EscrowRecord): EscrowRecord {
    return {
      ...record,
      conditions: [...record.conditions],
      metConditions: [...record.metConditions],
      auditTrail: record.auditTrail.map((entry) => ({ ...entry })),
    };
  }
}
