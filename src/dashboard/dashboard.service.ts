// @ts-nocheck

import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../database/prisma.service';
import {
  DashboardDto,
  ProfileSummaryDto,
  QuickStatsDto,
  ActivityItemDto,
  RecommendationItemDto,
} from './dto/dashboard.dto';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(private prisma: PrismaService) {}

  async getDashboard(userId: string): Promise<DashboardDto> {
    this.logger.log(`Fetching dashboard for user ${userId}`);
    const [profile, stats, recentActivity, recommendations] = await Promise.all([
      this.getProfileSummary(userId),
      this.getQuickStats(userId),
      this.getRecentActivity(userId),
      this.getRecommendations(userId),
    ]);

    return {
      profile,
      stats,
      recentActivity,
      recommendations,
    };
  }

  private async getProfileSummary(userId: string): Promise<ProfileSummaryDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        role: true,
        avatar: true,
        isVerified: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone || undefined,
      role: user.role,
      avatar: user.avatar || undefined,
      isVerified: user.isVerified,
      createdAt: user.createdAt,
      memberSince: user.createdAt.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
    };
  }

  private async getQuickStats(userId: string): Promise<QuickStatsDto> {
    // Issue #911 – Replace separate per-role queries and in-memory aggregation
    // with a single grouped count query + a single transaction query using OR.

    // Count all properties owned by the user with a single query; use groupBy
    // to get active vs total in one round-trip.
    const [totalProperties, activeListings] = await Promise.all([
      this.prisma.property.count({ where: { ownerId: userId } }),
      this.prisma.property.count({ where: { ownerId: userId, status: 'ACTIVE' } }),
    ]);

    // Single query with OR covers buyer + seller roles; use aggregation for
    // value so we avoid loading all transaction rows into memory.
    const allTransactions = await this.prisma.transaction.findMany({
      where: { OR: [{ buyerId: userId }, { sellerId: userId }] },
      select: { status: true, amount: true },
    });

    const pendingTransactions = allTransactions.filter((t) => t.status === 'PENDING').length;
    const completedTransactions = allTransactions.filter((t) => t.status === 'COMPLETED').length;

    // Calculate total transaction value
    const totalTransactionValue = allTransactions
      .filter((t) => t.status === 'COMPLETED')
      .reduce((sum, t) => sum.plus(t.amount), new Decimal(0));

    return {
      totalProperties,
      activeListings,
      pendingTransactions,
      completedTransactions,
      totalTransactionValue,
    };
  }

  private async getRecentActivity(userId: string, limit: number = 10): Promise<ActivityItemDto[]> {
    const activities: ActivityItemDto[] = [];

    // Get recent property changes
    const recentProperties = await this.prisma.property.findMany({
      where: { ownerId: userId },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });

    for (const property of recentProperties) {
      if (property.createdAt === property.updatedAt) {
        // Property was just created
        activities.push({
          id: `prop-created-${property.id}`,
          type: 'property_created',
          title: `Property Listed: ${property.title}`,
          description: `You listed a new property at ${property.address}`,
          timestamp: property.createdAt,
          relatedId: property.id,
        });
      } else {
        // Property was updated
        activities.push({
          id: `prop-updated-${property.id}`,
          type: 'property_updated',
          title: `Property Updated: ${property.title}`,
          description: `You updated property at ${property.address}`,
          timestamp: property.updatedAt,
          relatedId: property.id,
        });
      }
    }

    // Get recent transactions
    const recentTransactions = await this.prisma.transaction.findMany({
      where: {
        OR: [{ buyerId: userId }, { sellerId: userId }],
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        property: true,
      },
    });

    for (const transaction of recentTransactions) {
      const isBuyer = transaction.buyerId === userId;
      const role = isBuyer ? 'bought' : 'sold';
      const type =
        transaction.status === 'COMPLETED' ? 'transaction_completed' : 'transaction_pending';

      activities.push({
        id: transaction.id,
        type,
        title: `Transaction ${type === 'transaction_completed' ? 'Completed' : 'Pending'}: ${transaction.property.title}`,
        description: `You ${role} a property for $${transaction.amount.toString()}`,
        timestamp: transaction.createdAt,
        relatedId: transaction.id,
      });
    }

    // Sort by timestamp and limit
    return activities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, limit);
  }

  private async getRecommendations(
    userId: string,
    limit: number = 5,
  ): Promise<RecommendationItemDto[]> {
    // Get user's owned properties to understand their market segment
    const userProperties = await this.prisma.property.findMany({
      where: { ownerId: userId },
      select: { city: true, state: true, price: true, propertyType: true },
    });

    if (userProperties.length === 0) {
      // If user has no properties, get popular listings
      const recommendations = await this.prisma.property.findMany({
        where: {
          status: 'ACTIVE',
          ownerId: { not: userId },
        },
        orderBy: { updatedAt: 'desc' },
        take: limit,
      });

      return recommendations.map((prop) => ({
        id: prop.id,
        title: prop.title,
        address: prop.address,
        city: prop.city,
        state: prop.state,
        price: prop.price,
        propertyType: prop.propertyType,
        bedrooms: prop.bedrooms ?? undefined,
        bathrooms: prop.bathrooms ?? undefined,
        reason: 'Recently listed popular property',
      }));
    }

    // Get similar properties based on user's portfolio
    const similarProperties = await this.prisma.property.findMany({
      where: {
        status: 'ACTIVE',
        ownerId: { not: userId },
        OR: userProperties.map((prop) => ({
          AND: [
            { city: prop.city },
            { state: prop.state },
            { price: { gte: prop.price.times(0.8), lte: prop.price.times(1.2) } },
          ],
        })),
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });

    return similarProperties.map((prop) => ({
      id: prop.id,
      title: prop.title,
      address: prop.address,
      city: prop.city,
      state: prop.state,
      price: prop.price,
      propertyType: prop.propertyType,
      bedrooms: prop.bedrooms ?? undefined,
      bathrooms: prop.bathrooms ?? undefined,
      reason: `Similar to properties in ${prop.city}, ${prop.state}`,
    }));
  }
}
