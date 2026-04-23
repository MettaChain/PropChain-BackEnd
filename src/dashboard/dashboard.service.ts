import { Injectable, NotFoundException } from '@nestjs/common';
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
  constructor(private prisma: PrismaService) {}

  async getDashboard(userId: string): Promise<DashboardDto> {
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
    // Get user's properties
    const properties = await this.prisma.property.findMany({
      where: { ownerId: userId },
    });

    const totalProperties = properties.length;
    const activeListings = properties.filter((p: any) => p.status === 'ACTIVE').length;

    // Get user's transactions (both as buyer and seller)
    const buyerTransactions = await this.prisma.transaction.findMany({
      where: { buyerId: userId },
    });

    const sellerTransactions = await this.prisma.transaction.findMany({
      where: { sellerId: userId },
    });

    const allTransactions = [...buyerTransactions, ...sellerTransactions];
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

      return recommendations.map((prop: any) => ({
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
        OR: userProperties.map((prop: any) => ({
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

    return similarProperties.map((prop: any) => ({
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
