// @ts-nocheck

import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

const USAGE_ALERT_THRESHOLDS = [0.75, 0.9, 1.0] as const;

@Injectable()
export class ApiKeyAnalyticsService {
  private readonly logger = new Logger(ApiKeyAnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async recordUsage(apiKeyId: string): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await this.prisma.apiKeyUsageDaily.upsert({
      where: {
        apiKeyId_date: { apiKeyId, date: today },
      },
      update: { requestCount: { increment: 1 } },
      create: { apiKeyId, date: today, requestCount: 1 },
    });

    const apiKey = await this.prisma.apiKey.findUnique({ where: { id: apiKeyId } });
    if (!apiKey) return;

    if (apiKey.monthlyQuota) {
      const usage = await this.getMonthlyUsage(apiKeyId);
      if (usage >= apiKey.monthlyQuota) {
        this.logger.warn(
          `API key ${apiKeyId} has exceeded monthly quota: ${usage}/${apiKey.monthlyQuota}`,
        );
      } else {
        for (const threshold of USAGE_ALERT_THRESHOLDS) {
          const ratio = usage / apiKey.monthlyQuota;
          if (ratio >= threshold) {
            this.logger.warn(
              `API key ${apiKeyId} usage alert: ${Math.round(ratio * 100)}% of monthly quota (${usage}/${apiKey.monthlyQuota})`,
            );
            break;
          }
        }
      }
    }
  }

  async checkQuota(apiKeyId: string): Promise<void> {
    const apiKey = await this.prisma.apiKey.findUnique({ where: { id: apiKeyId } });
    if (!apiKey || !apiKey.monthlyQuota) return;

    const usage = await this.getMonthlyUsage(apiKeyId);
    if (usage >= apiKey.monthlyQuota) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Monthly API key quota exceeded',
          quota: apiKey.monthlyQuota,
          usage,
          retryAfter: this.getSecondsUntilMonthReset(),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async getMonthlyUsage(apiKeyId: string): Promise<number> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const result = await this.prisma.apiKeyUsageDaily.aggregate({
      where: {
        apiKeyId,
        date: { gte: startOfMonth },
      },
      _sum: { requestCount: true },
    });

    return result._sum.requestCount ?? 0;
  }

  async getUsageAnalytics(apiKeyId: string, userId: string) {
    const apiKey = await this.prisma.apiKey.findFirst({
      where: { id: apiKeyId, userId },
    });

    if (!apiKey) {
      throw new HttpException('API key not found', HttpStatus.NOT_FOUND);
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const [monthlyUsage, dailyUsage, totalUsage] = await Promise.all([
      this.prisma.apiKeyUsageDaily.aggregate({
        where: { apiKeyId, date: { gte: startOfMonth } },
        _sum: { requestCount: true },
      }),
      this.prisma.apiKeyUsageDaily.findMany({
        where: { apiKeyId, date: { gte: startOfWeek } },
        orderBy: { date: 'asc' },
        select: { date: true, requestCount: true },
      }),
      this.prisma.apiKeyUsageDaily.aggregate({
        where: { apiKeyId },
        _sum: { requestCount: true },
      }),
    ]);

    const monthlyTotal = monthlyUsage._sum.requestCount ?? 0;
    const lifetimeTotal = totalUsage._sum.requestCount ?? 0;

    let quotaUsage: any = null;
    if (apiKey.monthlyQuota) {
      quotaUsage = {
        limit: apiKey.monthlyQuota,
        used: monthlyTotal,
        remaining: Math.max(0, apiKey.monthlyQuota - monthlyTotal),
        percentage: Math.round((monthlyTotal / apiKey.monthlyQuota) * 100),
        resetsAt: new Date(now.getFullYear(), now.getMonth() + 1, 1),
      };
    }

    return {
      apiKeyId: apiKey.id,
      name: apiKey.name,
      keyPrefix: apiKey.keyPrefix,
      monthly: {
        used: monthlyTotal,
        resetsAt: new Date(now.getFullYear(), now.getMonth() + 1, 1),
      },
      weekly: dailyUsage.map((d: any) => ({
        date: d.date,
        requests: d.requestCount,
      })),
      lifetime: {
        totalRequests: lifetimeTotal,
        createdAt: apiKey.createdAt,
      },
      quota: quotaUsage,
      lastUsedAt: apiKey.lastUsedAt,
    };
  }

  private getSecondsUntilMonthReset(): number {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return Math.ceil((nextMonth.getTime() - now.getTime()) / 1000);
  }
}
