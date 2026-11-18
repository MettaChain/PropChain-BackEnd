import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

export enum CommissionPayoutStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  DISPUTED = 'DISPUTED',
}

export interface CommissionParticipantInput {
  participantId: string;
  role: string;
  percentage: number;
}

export interface CommissionTier {
  label?: string;
  minAmount: number;
  multiplier: number;
}

export interface CommissionParticipantBreakdown extends CommissionParticipantInput {
  amount: number;
  adjustment: number;
  payoutStatus: CommissionPayoutStatus;
}

export interface CommissionSplitResult {
  transactionId: string;
  baseCommission: number;
  effectiveCommission: number;
  tierLabel?: string;
  totalPercentage: number;
  participants: CommissionParticipantBreakdown[];
}

@Injectable()
export class CommissionSplitCalculationService {
  private readonly splits = new Map<string, CommissionSplitResult>();

  calculate(
    transactionId: string,
    baseCommission: number,
    participants: CommissionParticipantInput[],
    tiers: CommissionTier[] = [],
  ): CommissionSplitResult {
    if (baseCommission < 0) {
      throw new BadRequestException('Commission amount cannot be negative');
    }
    if (participants.length === 0) {
      throw new BadRequestException('At least one commission participant is required');
    }

    const totalPercentage = participants.reduce((sum, item) => sum + item.percentage, 0);
    if (Math.abs(totalPercentage - 100) > 0.001) {
      throw new BadRequestException('Commission split percentages must total 100%');
    }

    const tier = tiers
      .filter((item) => baseCommission >= item.minAmount)
      .sort((a, b) => b.minAmount - a.minAmount)[0];
    const effectiveCommission = Number((baseCommission * (tier?.multiplier ?? 1)).toFixed(2));

    const result: CommissionSplitResult = {
      transactionId,
      baseCommission,
      effectiveCommission,
      tierLabel: tier?.label,
      totalPercentage,
      participants: participants.map((participant) => ({
        ...participant,
        amount: Number(((effectiveCommission * participant.percentage) / 100).toFixed(2)),
        adjustment: 0,
        payoutStatus: CommissionPayoutStatus.PENDING,
      })),
    };

    this.splits.set(transactionId, result);
    return this.clone(result);
  }

  get(transactionId: string): CommissionSplitResult {
    const result = this.splits.get(transactionId);
    if (!result) throw new NotFoundException(`Commission split ${transactionId} not found`);
    return this.clone(result);
  }

  applyAdjustment(
    transactionId: string,
    participantId: string,
    adjustment: number,
  ): CommissionSplitResult {
    const result = this.getRecord(transactionId);
    const participant = result.participants.find((item) => item.participantId === participantId);
    if (!participant) {
      throw new NotFoundException(`Participant ${participantId} not found`);
    }
    if (participant.amount + adjustment < 0) {
      throw new BadRequestException('Adjustment cannot make participant payout negative');
    }

    participant.adjustment = Number((participant.adjustment + adjustment).toFixed(2));
    participant.amount = Number((participant.amount + adjustment).toFixed(2));
    if (adjustment !== 0) {
      participant.payoutStatus = CommissionPayoutStatus.DISPUTED;
    }

    return this.clone(result);
  }

  markPayout(
    transactionId: string,
    participantId: string,
    status: CommissionPayoutStatus,
  ): CommissionSplitResult {
    const result = this.getRecord(transactionId);
    const participant = result.participants.find((item) => item.participantId === participantId);
    if (!participant) {
      throw new NotFoundException(`Participant ${participantId} not found`);
    }

    participant.payoutStatus = status;
    return this.clone(result);
  }

  getSummary(transactionId: string) {
    const result = this.getRecord(transactionId);
    return {
      transactionId,
      effectiveCommission: result.effectiveCommission,
      totalAllocated: Number(
        result.participants.reduce((sum, item) => sum + item.amount, 0).toFixed(2),
      ),
      paid: result.participants.filter(
        (item) => item.payoutStatus === CommissionPayoutStatus.PAID,
      ).length,
      pending: result.participants.filter(
        (item) => item.payoutStatus === CommissionPayoutStatus.PENDING,
      ).length,
      disputed: result.participants.filter(
        (item) => item.payoutStatus === CommissionPayoutStatus.DISPUTED,
      ).length,
    };
  }

  private getRecord(transactionId: string): CommissionSplitResult {
    const result = this.splits.get(transactionId);
    if (!result) throw new NotFoundException(`Commission split ${transactionId} not found`);
    return result;
  }

  private clone(result: CommissionSplitResult): CommissionSplitResult {
    return {
      ...result,
      participants: result.participants.map((participant) => ({ ...participant })),
    };
  }
}
