import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class TrackingService {
  constructor(private prisma: PrismaService) {}

  async trackClick(url: string, userId?: string, ipAddress?: string, userAgent?: string) {
    return this.prisma.linkClick.create({
      data: {
        url,
        userId,
        ipAddress,
        userAgent,
      },
    });
  }

  async trackEmailOpen(trackingId: string, ipAddress?: string, userAgent?: string) {
    return this.prisma.emailEngagement
      .update({
        where: { trackingId },
        data: {
          openedAt: new Date(),
          ipAddress,
          userAgent,
        },
      })
      .catch(() => {
        // Ignore if trackingId not found
      });
  }

  async createEmailEngagement(userId: string, emailType: string, trackingId: string) {
    return this.prisma.emailEngagement.create({
      data: {
        userId,
        emailType,
        trackingId,
      },
    });
  }

  async getClickStats() {
    const stats = await this.prisma.linkClick.groupBy({
      by: ['url'],
      _count: {
        _all: true,
      },
      orderBy: {
        _count: {
          url: 'desc',
        },
      },
      take: 10,
    });

    return stats.map((s) => ({
      url: s.url,
      clicks: s._count._all,
    }));
  }

  async getEmailStats() {
    const totalSent = await this.prisma.emailEngagement.count();
    const totalOpened = await this.prisma.emailEngagement.count({
      where: { openedAt: { not: null } },
    });

    return {
      totalSent,
      totalOpened,
      openRate: totalSent > 0 ? (totalOpened / totalSent) * 100 : 0,
    };
  }
}
