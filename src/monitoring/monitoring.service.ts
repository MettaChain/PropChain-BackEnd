import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class MonitoringService {
  constructor(private readonly prisma: PrismaService) {}

  async getRequestCounts(since?: Date) {
    const where = since ? { createdAt: { gte: since } } : {};
    const [total, byMethod, byStatus] = await Promise.all([
      this.prisma.apiRequestLog.count({ where }),
      this.prisma.apiRequestLog.groupBy({
        by: ['method'],
        where,
        _count: { method: true },
        orderBy: { _count: { method: 'desc' } },
      }),
      this.prisma.apiRequestLog.groupBy({
        by: ['statusCode'],
        where,
        _count: { statusCode: true },
        orderBy: { _count: { statusCode: 'desc' } },
      }),
    ]);
    return {
      total,
      byMethod: byMethod.map((r) => ({ method: r.method, count: r._count.method })),
      byStatus: byStatus.map((r) => ({ statusCode: r.statusCode, count: r._count.statusCode })),
    };
  }

  async getErrorRates(since?: Date) {
    const where = since ? { createdAt: { gte: since } } : {};
    const errorWhere = { ...where, statusCode: { gte: 400 } };
    const [total, errors, topErrors] = await Promise.all([
      this.prisma.apiRequestLog.count({ where }),
      this.prisma.apiRequestLog.count({ where: errorWhere }),
      this.prisma.apiRequestLog.groupBy({
        by: ['path', 'statusCode'],
        where: errorWhere,
        _count: { path: true },
        orderBy: { _count: { path: 'desc' } },
        take: 10,
      }),
    ]);
    return {
      total,
      errors,
      errorRate: total > 0 ? ((errors / total) * 100).toFixed(2) + '%' : '0%',
      topErrors: topErrors.map((r) => ({
        path: r.path,
        statusCode: r.statusCode,
        count: r._count.path,
      })),
    };
  }

  async getSlowEndpoints(thresholdMs = 1000, since?: Date) {
    const where = {
      ...(since ? { createdAt: { gte: since } } : {}),
      responseTime: { gte: thresholdMs },
    };
    const [slow, avgByPath] = await Promise.all([
      this.prisma.apiRequestLog.count({ where }),
      this.prisma.apiRequestLog.groupBy({
        by: ['path', 'method'],
        where: since ? { createdAt: { gte: since } } : {},
        _avg: { responseTime: true },
        _max: { responseTime: true },
        _count: { path: true },
        orderBy: { _avg: { responseTime: 'desc' } },
        take: 10,
      }),
    ]);
    return {
      slowRequestCount: slow,
      thresholdMs,
      slowestEndpoints: avgByPath.map((r) => ({
        method: r.method,
        path: r.path,
        avgResponseTimeMs: Math.round(r._avg.responseTime ?? 0),
        maxResponseTimeMs: r._max.responseTime ?? 0,
        requestCount: r._count.path,
      })),
    };
  }

  async getUsageByUser(since?: Date, take = 20) {
    const where = {
      ...(since ? { createdAt: { gte: since } } : {}),
      userId: { not: null },
    };
    const usage = await this.prisma.apiRequestLog.groupBy({
      by: ['userId'],
      where,
      _count: { userId: true },
      _avg: { responseTime: true },
      orderBy: { _count: { userId: 'desc' } },
      take,
    });
    return usage.map((r) => ({
      userId: r.userId,
      requestCount: r._count.userId,
      avgResponseTimeMs: Math.round(r._avg.responseTime ?? 0),
    }));
  }

  async getSummary() {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [counts, errors, slow] = await Promise.all([
      this.getRequestCounts(since24h),
      this.getErrorRates(since24h),
      this.getSlowEndpoints(1000, since24h),
    ]);
    return {
      period: 'last_24h',
      requestCounts: counts,
      errorRates: errors,
      slowEndpoints: slow,
    };
  }
}