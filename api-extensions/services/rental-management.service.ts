import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { PrismaService } from '../../src/database/prisma.service';
import type { NotificationsService } from '../../src/notifications/notifications.service';

export const RENTAL_PRISMA_SERVICE = Symbol('RENTAL_PRISMA_SERVICE');
export const RENTAL_NOTIFICATIONS_SERVICE = Symbol('RENTAL_NOTIFICATIONS_SERVICE');

const DAY_MS = 24 * 60 * 60 * 1000;
const EXPIRATION_ALERT_DAYS = [30, 60, 90];

export enum LeaseStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  TERMINATED = 'TERMINATED',
}

export enum RentPaymentStatus {
  SCHEDULED = 'SCHEDULED',
  PAID = 'PAID',
  OVERDUE = 'OVERDUE',
}

export interface CreateLeaseInput {
  propertyId: string;
  tenantId: string;
  landlordId?: string;
  startDate: Date;
  endDate: Date;
  monthlyRent: number;
  depositAmount?: number;
  rentDueDay?: number;
}

export interface RecordRentPaymentInput {
  leaseId: string;
  amount: number;
  paidAt?: Date;
  reference?: string;
}

export interface TerminateLeaseInput {
  leaseId: string;
  reason: string;
  actorId?: string;
  terminatedAt?: Date;
}

export interface RentPaymentRecord {
  dueDate: Date;
  amount: number;
  status: RentPaymentStatus;
  paidAt?: Date;
  reference?: string;
}

export interface LeaseRecord {
  id: string;
  propertyId: string;
  tenantId: string;
  landlordId?: string;
  status: LeaseStatus;
  monthlyRent: number;
  depositAmount: number;
  rentDueDay: number;
  startDate: Date;
  endDate: Date;
  payments: RentPaymentRecord[];
  alertsSent: number[];
  createdAt: Date;
  activatedAt?: Date;
  terminatedAt?: Date;
  terminationReason?: string;
}

export interface RentalIncomeSummary {
  propertyId: string;
  paymentCount: number;
  totalAmount: number;
}

@Injectable()
export class RentalManagementService {
  private readonly leases = new Map<string, LeaseRecord>();

  constructor(
    @Inject(RENTAL_PRISMA_SERVICE) private readonly prisma: PrismaService,
    @Inject(RENTAL_NOTIFICATIONS_SERVICE)
    private readonly notifications: NotificationsService,
  ) {}

  async create(input: CreateLeaseInput): Promise<LeaseRecord> {
    if (!Number.isFinite(input.monthlyRent) || input.monthlyRent <= 0) {
      throw new BadRequestException('Monthly rent must be greater than zero');
    }
    const depositAmount = input.depositAmount ?? 0;
    if (!Number.isFinite(depositAmount) || depositAmount < 0) {
      throw new BadRequestException('Deposit amount cannot be negative');
    }
    const rentDueDay = input.rentDueDay ?? 1;
    if (!Number.isInteger(rentDueDay) || rentDueDay < 1 || rentDueDay > 28) {
      throw new BadRequestException('Rent due day must be between 1 and 28');
    }
    if (input.endDate.getTime() <= input.startDate.getTime()) {
      throw new BadRequestException('Lease end date must be after the start date');
    }

    const property = await this.prisma.property.findUnique({
      where: { id: input.propertyId },
    });
    if (!property) {
      throw new NotFoundException(`Property ${input.propertyId} not found`);
    }

    const record: LeaseRecord = {
      id: randomUUID(),
      propertyId: input.propertyId,
      tenantId: input.tenantId,
      landlordId: input.landlordId,
      status: LeaseStatus.DRAFT,
      monthlyRent: input.monthlyRent,
      depositAmount,
      rentDueDay,
      startDate: new Date(input.startDate),
      endDate: new Date(input.endDate),
      payments: this.buildSchedule(input.startDate, input.endDate, rentDueDay, input.monthlyRent),
      alertsSent: [],
      createdAt: new Date(),
    };
    this.leases.set(record.id, record);
    return this.clone(record);
  }

  async findOne(id: string): Promise<LeaseRecord> {
    return this.clone(this.getRecord(id));
  }

  async activate(id: string): Promise<LeaseRecord> {
    const lease = this.getRecord(id);
    if (lease.status !== LeaseStatus.DRAFT) {
      throw new ConflictException('Only draft leases can be activated');
    }
    lease.status = LeaseStatus.ACTIVE;
    lease.activatedAt = new Date();
    await this.notify(lease, 'LEASE_ACTIVATED', 'Your lease is now active', { leaseId: lease.id });
    return this.clone(lease);
  }

  async recordPayment(input: RecordRentPaymentInput): Promise<LeaseRecord> {
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      throw new BadRequestException('Rent payment amount must be greater than zero');
    }
    const lease = this.getRecord(input.leaseId);
    if (lease.status !== LeaseStatus.ACTIVE) {
      throw new ConflictException('Rent can only be recorded for an active lease');
    }

    const payment = lease.payments.find((entry) => entry.status !== RentPaymentStatus.PAID);
    if (!payment) {
      throw new BadRequestException('No outstanding rent payment for this lease');
    }
    payment.status = RentPaymentStatus.PAID;
    payment.amount = input.amount;
    payment.paidAt = input.paidAt ?? new Date();
    payment.reference = input.reference;
    await this.notify(lease, 'RENT_PAYMENT_RECORDED', 'Your rent payment was recorded', {
      leaseId: lease.id,
      amount: input.amount,
    });
    return this.clone(lease);
  }

  async detectOverdue(asOf: Date = new Date()): Promise<LeaseRecord[]> {
    const changed: LeaseRecord[] = [];
    for (const lease of this.leases.values()) {
      if (lease.status !== LeaseStatus.ACTIVE) {
        continue;
      }
      let overdueCount = 0;
      for (const payment of lease.payments) {
        if (
          payment.status === RentPaymentStatus.SCHEDULED &&
          payment.dueDate.getTime() < asOf.getTime()
        ) {
          payment.status = RentPaymentStatus.OVERDUE;
          overdueCount += 1;
        }
      }
      if (overdueCount > 0) {
        await this.notify(lease, 'RENT_OVERDUE', `${overdueCount} rent payment(s) are overdue`, {
          leaseId: lease.id,
          overdueCount,
        });
        changed.push(this.clone(lease));
      }
    }
    return changed;
  }

  async sendExpirationAlerts(asOf: Date = new Date()): Promise<LeaseRecord[]> {
    const changed: LeaseRecord[] = [];
    for (const lease of this.leases.values()) {
      if (lease.status !== LeaseStatus.ACTIVE) {
        continue;
      }
      const daysRemaining = Math.ceil((lease.endDate.getTime() - asOf.getTime()) / DAY_MS);
      if (
        EXPIRATION_ALERT_DAYS.includes(daysRemaining) &&
        !lease.alertsSent.includes(daysRemaining)
      ) {
        lease.alertsSent.push(daysRemaining);
        await this.notify(lease, 'LEASE_EXPIRING', `Your lease expires in ${daysRemaining} days`, {
          leaseId: lease.id,
          daysRemaining,
        });
        changed.push(this.clone(lease));
      }
    }
    return changed;
  }

  async terminate(input: TerminateLeaseInput): Promise<LeaseRecord> {
    const lease = this.getRecord(input.leaseId);
    if (lease.status === LeaseStatus.TERMINATED) {
      throw new ConflictException('Lease has already been terminated');
    }
    lease.status = LeaseStatus.TERMINATED;
    lease.terminationReason = input.reason;
    lease.terminatedAt = input.terminatedAt ?? new Date();
    await this.notify(lease, 'LEASE_TERMINATED', `Your lease was terminated: ${input.reason}`, {
      leaseId: lease.id,
      actorId: input.actorId,
    });
    return this.clone(lease);
  }

  async getRentalIncome(propertyId: string, from: Date, to: Date): Promise<RentalIncomeSummary> {
    const payments = Array.from(this.leases.values())
      .filter((lease) => lease.propertyId === propertyId)
      .flatMap((lease) => lease.payments)
      .filter(
        (payment) =>
          payment.status === RentPaymentStatus.PAID &&
          payment.paidAt &&
          payment.paidAt.getTime() >= from.getTime() &&
          payment.paidAt.getTime() <= to.getTime(),
      );
    return {
      propertyId,
      paymentCount: payments.length,
      totalAmount: Number(payments.reduce((sum, payment) => sum + payment.amount, 0).toFixed(2)),
    };
  }

  private getRecord(id: string): LeaseRecord {
    const lease = this.leases.get(id);
    if (!lease) {
      throw new NotFoundException(`Lease ${id} not found`);
    }
    return lease;
  }

  private buildSchedule(
    startDate: Date,
    endDate: Date,
    rentDueDay: number,
    amount: number,
  ): RentPaymentRecord[] {
    const payments: RentPaymentRecord[] = [];
    const cursor = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1));
    while (cursor.getTime() <= endDate.getTime()) {
      const daysInMonth = new Date(
        Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0),
      ).getUTCDate();
      const dueDate = new Date(
        Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), Math.min(rentDueDay, daysInMonth)),
      );
      if (dueDate.getTime() >= startDate.getTime() && dueDate.getTime() <= endDate.getTime()) {
        payments.push({ dueDate, amount, status: RentPaymentStatus.SCHEDULED });
      }
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    return payments;
  }

  private async notify(
    lease: LeaseRecord,
    title: string,
    message: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.notifications.sendNotification(lease.tenantId, title, message, 'RENTAL_MANAGEMENT', {
      ...metadata,
      propertyId: lease.propertyId,
    });
  }

  private clone(lease: LeaseRecord): LeaseRecord {
    return {
      ...lease,
      payments: lease.payments.map((payment) => ({ ...payment })),
      alertsSent: [...lease.alertsSent],
    };
  }
}
