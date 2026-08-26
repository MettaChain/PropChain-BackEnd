import { Injectable } from '@nestjs/common';
import { FeeBreakdown } from './dto/transaction.dto';

/** Default fee rates */
const PLATFORM_FEE_RATE = 0.015; // 1.5%
const DEFAULT_AGENT_COMMISSION_RATE = 0.03; // 3%
const TAX_RATE = 0.08; // 8%

@Injectable()
export class TransactionFeesService {
  /**
   * Calculate all fees for a given transaction amount.
   * @param amount - The base transaction amount
   * @param agentCommissionRate - Optional override for agent commission rate (0–1)
   */
  calculateFees(amount: number, agentCommissionRate?: number): FeeBreakdown {
    const commissionRate = agentCommissionRate ?? DEFAULT_AGENT_COMMISSION_RATE;

    const platformFee = this.round(amount * PLATFORM_FEE_RATE);
    const agentCommission = this.round(amount * commissionRate);
    const taxableAmount = amount + platformFee + agentCommission;
    const tax = this.round(taxableAmount * TAX_RATE);
    const totalFees = this.round(platformFee + agentCommission + tax);
    const totalAmount = this.round(amount + totalFees);

    return {
      transactionAmount: amount,
      platformFee,
      platformFeeRate: PLATFORM_FEE_RATE,
      agentCommission,
      agentCommissionRate: commissionRate,
      tax,
      taxRate: TAX_RATE,
      totalFees,
      totalAmount,
    };
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
