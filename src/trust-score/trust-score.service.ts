// @ts-nocheck

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { UserData } from './types/user-data.interface';

export interface TrustScoreBreakdown {
  emailVerified: { score: number; maxScore: number; percentage: number };
  idVerified: { score: number; maxScore: number; percentage: number };
  completedTransactions: { score: number; maxScore: number; percentage: number };
  activityDecay: { score: number; maxScore: number; percentage: number };
  totalScore: number;
  totalMaxScore: number;
}

export interface TrustScoreResult {
  userId: string;
  score: number;
  breakdown: TrustScoreBreakdown;
  lastUpdated: Date;
  nextUpdateTime?: Date;
}

@Injectable()
export class TrustScoreService {
  private readonly logger = new Logger(TrustScoreService.name);
  private readonly updateIntervalHours = 24;
  private readonly DECAY_RATE_PER_MONTH = 0.1;

  constructor(private prisma: PrismaService) {}

  /**
   * Calculate trust score for a user
   */
  async calculateTrustScore(userId: string): Promise<TrustScoreResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        buyerTransactions: true,
        sellerTransactions: true,
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const breakdown = await this.calculateBreakdown(user);
    const totalScore = this.calculateTotalScore(breakdown);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        trustScore: totalScore,
        lastTrustScoreUpdate: new Date(),
      },
    });

    const nextUpdateTime = new Date();
    nextUpdateTime.setHours(nextUpdateTime.getHours() + this.updateIntervalHours);

    return {
      userId,
      score: totalScore,
      breakdown,
      lastUpdated: new Date(),
      nextUpdateTime,
    };
  }

  /**
   * Get current trust score for a user (may be cached)
   */
  async getTrustScore(userId: string, forceRefresh = false): Promise<TrustScoreResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const shouldRefresh =
      forceRefresh || !user.lastTrustScoreUpdate || this.isUpdateNeeded(user.lastTrustScoreUpdate);

    if (shouldRefresh) {
      return this.calculateTrustScore(userId);
    }

    const breakdown = await this.getScoreBreakdown(userId);
    const nextUpdateTime = new Date(user.lastTrustScoreUpdate || new Date());
    nextUpdateTime.setHours(nextUpdateTime.getHours() + this.updateIntervalHours);

    return {
      userId,
      score: user.trustScore,
      breakdown,
      lastUpdated: user.lastTrustScoreUpdate || new Date(),
      nextUpdateTime,
    };
  }

  /**
   * Get detailed breakdown of trust score factors
   */
  async getScoreBreakdown(userId: string): Promise<TrustScoreBreakdown> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        buyerTransactions: true,
        sellerTransactions: true,
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    return this.calculateBreakdown(user);
  }

  /**
   * Recalculate trust score after relevant events (transaction completion, verification)
   */
  async recalculateOnEvent(userId: string, eventType: string): Promise<TrustScoreResult> {
    this.logger.log(`Recalculating trust score for user ${userId} due to event: ${eventType}`);
    return this.calculateTrustScore(userId);
  }

  /**
   * Calculate individual score components
   * Factors:
   *  - email_verified: 10 pts
   *  - id_verified: 20 pts
   *  - completed_transactions: 15 pts each (max 3 = 45 pts)
   *  - activity_decay: -10% per month of inactivity
   */
  private async calculateBreakdown(user: any): Promise<TrustScoreBreakdown> {
    const emailVerifiedScore = user.isVerified ? 10 : 0;

    const idVerified = await this.prisma.verificationDocument.findFirst({
      where: {
        userId: user.id,
        status: 'APPROVED',
      },
    });
    const idVerifiedScore = idVerified ? 20 : 0;

    const completedBuyer =
      user.buyerTransactions?.filter((t: any) => t.status === 'COMPLETED') || [];
    const completedSeller =
      user.sellerTransactions?.filter((t: any) => t.status === 'COMPLETED') || [];
    const totalCompleted = completedBuyer.length + completedSeller.length;
    const cappedCompleted = Math.min(totalCompleted, 3);
    const completedTransactionsScore = cappedCompleted * 15;

    const baseScore = emailVerifiedScore + idVerifiedScore + completedTransactionsScore;

    const decayPenalty = this.calculateDecayPenalty(user.lastActivityAt || user.updatedAt);

    const finalScore = Math.max(0, Math.round(baseScore * (1 - decayPenalty)));

    return {
      emailVerified: {
        score: emailVerifiedScore,
        maxScore: 10,
        percentage: (emailVerifiedScore / 10) * 100,
      },
      idVerified: {
        score: idVerifiedScore,
        maxScore: 20,
        percentage: (idVerifiedScore / 20) * 100,
      },
      completedTransactions: {
        score: completedTransactionsScore,
        maxScore: 45,
        percentage: (completedTransactionsScore / 45) * 100,
      },
      activityDecay: {
        score: finalScore,
        maxScore: baseScore,
        percentage: baseScore > 0 ? (finalScore / baseScore) * 100 : 100,
      },
      totalScore: finalScore,
      totalMaxScore: 75,
    };
  }

  /**
   * Calculate decay penalty based on months of inactivity.
   * Decay rate: 10% per month of inactivity (capped at 90%).
   */
  private calculateDecayPenalty(lastActivityAt: Date | null): number {
    if (!lastActivityAt) return 0;

    const now = new Date();
    const diffMs = now.getTime() - new Date(lastActivityAt).getTime();
    const monthsInactive = diffMs / (1000 * 60 * 60 * 24 * 30.44);

    if (monthsInactive < 1) return 0;

    const penalty = Math.min(monthsInactive * this.DECAY_RATE_PER_MONTH, 0.9);
    return penalty;
  }

  /**
   * Calculate total trust score
   */
  private calculateTotalScore(breakdown: TrustScoreBreakdown): number {
    return breakdown.totalScore;
  }

  /**
   * Check if score needs updating
   */
  private isUpdateNeeded(lastUpdate: Date): boolean {
    const now = new Date();
    const diffHours = (now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60);
    return diffHours >= this.updateIntervalHours;
  }

  /**
   * Batch update trust scores for all users
   */
  async batchUpdateTrustScores(): Promise<{ updated: number; failed: number }> {
    const users = await this.prisma.user.findMany();
    let updated = 0;
    let failed = 0;

    for (const user of users) {
      try {
        await this.calculateTrustScore(user.id);
        updated++;
      } catch (error) {
        this.logger.error(`Failed to update trust score for user ${user.id}:`, error);
        failed++;
      }
    }

    return { updated, failed };
  }
}
