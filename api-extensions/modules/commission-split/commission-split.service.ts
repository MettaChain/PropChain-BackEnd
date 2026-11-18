import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  CommissionParticipantResponseDto,
  CommissionSplitResponseDto,
  CreateCommissionSplitDto,
  PayoutStatus,
  SplitStatus,
  UpdateCommissionSplitDto,
} from './dto/commission-split.dto';

interface CommissionSplitRecord extends CommissionSplitResponseDto {}

@Injectable()
export class CommissionSplitService {
  private readonly splits = new Map<string, CommissionSplitRecord>();

  create(dto: CreateCommissionSplitDto): CommissionSplitResponseDto {
    this.validateParticipants(dto);
    const now = new Date();
    const record: CommissionSplitRecord = {
      id: randomUUID(),
      transactionId: dto.transactionId,
      totalAmount: dto.totalAmount,
      adjustment: 0,
      tier: dto.tier,
      status: SplitStatus.PENDING,
      participants: this.calculateParticipants(dto.totalAmount, dto.participants),
      createdAt: now,
      updatedAt: now,
    };

    this.splits.set(record.id, record);
    return this.toResponse(record);
  }

  findAll(transactionId?: string): CommissionSplitResponseDto[] {
    return Array.from(this.splits.values())
      .filter((split) => !transactionId || split.transactionId === transactionId)
      .map((split) => this.toResponse(split));
  }

  findOne(id: string): CommissionSplitResponseDto {
    return this.toResponse(this.getRecord(id));
  }

  update(id: string, dto: UpdateCommissionSplitDto): CommissionSplitResponseDto {
    const record = this.getRecord(id);

    if (dto.adjustment !== undefined) {
      if (record.totalAmount + dto.adjustment < 0) {
        throw new BadRequestException('Adjustment cannot make the commission total negative');
      }
      record.adjustment = dto.adjustment;
      record.participants = this.calculateParticipants(
        record.totalAmount + dto.adjustment,
        record.participants,
      );
    }

    if (dto.status) {
      record.status = dto.status;
      if (dto.status === SplitStatus.PAID) {
        record.participants = record.participants.map((participant) => ({
          ...participant,
          payoutStatus: PayoutStatus.PAID,
        }));
      }
      if (dto.status === SplitStatus.DISPUTED) {
        record.participants = record.participants.map((participant) => ({
          ...participant,
          payoutStatus: PayoutStatus.DISPUTED,
        }));
      }
    }

    record.updatedAt = new Date();
    return this.toResponse(record);
  }

  markParticipantPaid(id: string, userId: string): CommissionSplitResponseDto {
    const record = this.getRecord(id);
    if (record.status === SplitStatus.DISPUTED) {
      throw new BadRequestException('Cannot pay a disputed commission split');
    }

    const participant = record.participants.find((item) => item.userId === userId);
    if (!participant) {
      throw new NotFoundException(`Participant ${userId} not found in commission split`);
    }

    participant.payoutStatus = PayoutStatus.PAID;
    if (record.participants.every((item) => item.payoutStatus === PayoutStatus.PAID)) {
      record.status = SplitStatus.PAID;
    }
    record.updatedAt = new Date();
    return this.toResponse(record);
  }

  private validateParticipants(dto: CreateCommissionSplitDto): void {
    if (dto.totalAmount <= 0) {
      throw new BadRequestException('Commission total amount must be greater than zero');
    }
    const userIds = new Set(dto.participants.map((participant) => participant.userId));
    if (userIds.size !== dto.participants.length) {
      throw new BadRequestException('Commission participants must be unique');
    }

    const totalPercentage = dto.participants.reduce(
      (sum, participant) => sum + participant.splitPercentage,
      0,
    );
    if (Math.abs(totalPercentage - 100) > 0.001) {
      throw new BadRequestException('Commission split percentages must total 100%');
    }
  }

  private calculateParticipants(
    totalAmount: number,
    participants: Array<{ userId: string; role: string; splitPercentage: number }>,
  ): CommissionParticipantResponseDto[] {
    return participants.map((participant) => ({
      userId: participant.userId,
      role: participant.role,
      splitPercentage: participant.splitPercentage,
      amount: Number(((totalAmount * participant.splitPercentage) / 100).toFixed(2)),
      payoutStatus: PayoutStatus.PENDING,
    }));
  }

  private getRecord(id: string): CommissionSplitRecord {
    const record = this.splits.get(id);
    if (!record) throw new NotFoundException(`Commission split ${id} not found`);
    return record;
  }

  private toResponse(record: CommissionSplitRecord): CommissionSplitResponseDto {
    return { ...record, participants: record.participants.map((item) => ({ ...item })) };
  }
}
