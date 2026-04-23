import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { UserData } from './types/user-data.interface';

export interface TrustScoreBreakdown {
  accountAge: { score: number; maxScore: number; percentage: number };
  emailVerification: { score: number; maxScore: number; percentage: number };
  twoFactorAuth: { score: number; maxScore: number; percentage: number };
  profileCompleteness: { score: number; maxScore: number; percentage: number };
  transactionHistory: { score: number; maxScore: number; percentage: number };
  propertyListings: { score: number; maxScore: number; percentage: number };
  apiKeyUsage: { score: number; maxScore: number; percentage: number };
  passwordSecurity: { score: number; maxScore: number; percentage: number };
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
  private readonly updateIntervalHours = 24; // Recalculate daily

  constructor(private prisma: PrismaService) {}

  /**
   * Calculate trust score for a user
   */
  async calculateTrustScore(userId: string): Promise<TrustScoreResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        properties: true,
        buyerTransactions: true,
        sellerTransactions: true,
        apiKeys: true,
        passwordHistory: true,
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const breakdown = await this.calculateBreakdown(user);
    const totalScore = this.calculateTotalScore(breakdown);

    // Update user's trust score in database
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

    // Check if score needs refresh
    const shouldRefresh =
      forceRefresh || !user.lastTrustScoreUpdate || this.isUpdateNeeded(user.lastTrustScoreUpdate);

    if (shouldRefresh) {
      return this.calculateTrustScore(userId);
    }

    // Return cached score with breakdown
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
        properties: true,
        buyerTransactions: true,
        sellerTransactions: true,
        apiKeys: true,
        passwordHistory: true,
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    return this.calculateBreakdown(user);
  }

  /**
   * Calculate individual score components
   */
  private async calculateBreakdown(user: UserData): Promise<TrustScoreBreakdown> {
    const accountAgeScore = this.calculateAccountAge(user.createdAt);
    const emailVerificationScore = user.isVerified ? 5 : 0;
    const twoFactorScore = user.twoFactorEnabled ? 5 : 0;
    const profileCompletenessScore = this.calculateProfileCompleteness(user);
    const transactionHistoryScore = await this.calculateTransactionHistory(user);
    const propertyListingsScore = this.calculatePropertyListings(user);
    const apiKeyUsageScore = this.calculateApiKeyUsage(user.apiKeys);
    const passwordSecurityScore = this.calculatePasswordSecurity(user.passwordHistory);

    return {
      accountAge: {
        score: accountAgeScore,
        maxScore: 10,
        percentage: (accountAgeScore / 10) * 100,
      },
      emailVerification: {
        score: emailVerificationScore,
        maxScore: 5,
        percentage: (emailVerificationScore / 5) * 100,
      },
      twoFactorAuth: {
        score: twoFactorScore,
        maxScore: 5,
        percentage: (twoFactorScore / 5) * 100,
      },
      profileCompleteness: {
        score: profileCompletenessScore,
        maxScore: 15,
        percentage: (profileCompletenessScore / 15) * 100,
      },
      transactionHistory: {
        score: transactionHistoryScore,
        maxScore: 25,
        percentage: (transactionHistoryScore / 25) * 100,
      },
      propertyListings: {
        score: propertyListingsScore,
        maxScore: 15,
        percentage: (propertyListingsScore / 15) * 100,
      },
      apiKeyUsage: {
        score: apiKeyUsageScore,
        maxScore: 10,
        percentage: (apiKeyUsageScore / 10) * 100,
      },
      passwordSecurity: {
        score: passwordSecurityScore,
        maxScore: 10,
        percentage: (passwordSecurityScore / 10) * 100,
      },
      totalScore: 0,
      totalMaxScore: 95,
    };
  }

  /**
   * Calculate account age score
   * Newer accounts get lower score
   */
  private calculateAccountAge(createdAt: Date): number {
    const ageInDays = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);

    // Scale: 0 days = 0 points, 365+ days = 10 points
    if (ageInDays >= 365) return 10;
    if (ageInDays >= 180) return 8;
    if (ageInDays >= 90) return 6;
    if (ageInDays >= 30) return 4;
    if (ageInDays >= 7) return 2;
    return 0;
  }

  /**
   * Calculate profile completeness score
   */
  private calculateProfileCompleteness(user: UserData): number {
    let score = 0;

    if (user.firstName) score += 3;
    if (user.lastName) score += 3;
    if (user.phone) score += 3;
    if (user.avatar) score += 3;
    if (user.email) score += 3;

    return Math.min(score, 15);
  }

  /**
   * Calculate transaction history score
   */
  private async calculateTransactionHistory(user: UserData): Promise<number> {
    const completedTransactions = [
      ...user.buyerTransactions.filter((t) => t.status === 'COMPLETED'),
      ...user.sellerTransactions.filter((t) => t.status === 'COMPLETED'),
    ];

    if (completedTransactions.length === 0) return 0;

    // Score based on transaction count and consistency
    let score = 0;
    if (completedTransactions.length >= 50) score = 25;
    else if (completedTransactions.length >= 25) score = 20;
    else if (completedTransactions.length >= 10) score = 15;
    else if (completedTransactions.length >= 5) score = 10;
    else if (completedTransactions.length >= 1) score = 5;

    return score;
  }

  /**
   * Calculate property listings score
   */
  private calculatePropertyListings(user: UserData): number {
    if (!user.properties || user.properties.length === 0) return 0;

    const activeListings = user.properties.filter((p) => p.status === 'ACTIVE').length;

    let score = 0;
    if (activeListings >= 20) score = 15;
    else if (activeListings >= 10) score = 12;
    else if (activeListings >= 5) score = 10;
    else if (activeListings >= 2) score = 7;
    else if (activeListings >= 1) score = 4;

    return score;
  }

  /**
   * Calculate API key usage score
   */
  private calculateApiKeyUsage(apiKeys: UserData['apiKeys']): number {
    if (!apiKeys || apiKeys.length === 0) return 0;

    // Score based on active, non-revoked API keys with recent usage
    const activeKeys = apiKeys.filter(
      (k) => !k.revokedAt && (!k.expiresAt || k.expiresAt > new Date()),
    );

    const recentlyUsedKeys = activeKeys.filter(
      (k) => k.lastUsedAt && Date.now() - k.lastUsedAt.getTime() < 30 * 24 * 60 * 60 * 1000, // Last 30 days
    );

    if (recentlyUsedKeys.length >= 3) return 10;
    if (recentlyUsedKeys.length === 2) return 7;
    if (recentlyUsedKeys.length === 1) return 5;
    return 0;
  }

  /**
   * Calculate password security score
   */
  private calculatePasswordSecurity(passwordHistory: UserData['passwordHistory']): number {
    if (!passwordHistory || passwordHistory.length === 0) return 0;

    // Recent password change is good
    const latestPasswordChange = passwordHistory[0];
    const daysSinceChange =
      (Date.now() - latestPasswordChange.createdAt.getTime()) / (1000 * 60 * 60 * 24);

    // Score based on password update frequency
    if (daysSinceChange <= 90) return 10;
    if (daysSinceChange <= 180) return 8;
    if (daysSinceChange <= 365) return 6;
    if (daysSinceChange <= 730) return 4;
    return 2;
  }

  /**
   * Calculate total trust score
   */
  private calculateTotalScore(breakdown: TrustScoreBreakdown): number {
    const total =
      breakdown.accountAge.score +
      breakdown.emailVerification.score +
      breakdown.twoFactorAuth.score +
      breakdown.profileCompleteness.score +
      breakdown.transactionHistory.score +
      breakdown.propertyListings.score +
      breakdown.apiKeyUsage.score +
      breakdown.passwordSecurity.score;

    // Convert to 0-100 scale
    return Math.round((total / breakdown.totalMaxScore) * 100);
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
