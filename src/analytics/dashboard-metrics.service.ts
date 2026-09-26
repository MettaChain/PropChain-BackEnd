import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CacheService } from '../cache/cache.service';
import { QueueMonitoringService } from '../admin/queue/queue.service';
import {
  FraudSeverity,
  FraudStatus,
  PropertyStatus,
  TransactionStatus,
} from '../types/prisma.types';

/**
 * Realtime dashboard aggregate feed (issue #1297).
 *
 * Computes low-frequency aggregate snapshots for the admin/agent dashboard and
 * caches them briefly so that the Socket.IO push loop never pressures the
 * database. Each individual metric degrades gracefully — a single failing
 * source (e.g. Redis or BullMQ) yields `null` for that section rather than
 * failing the whole snapshot.
 */
export interface DashboardQueueMetric {
  queue: string;
  depth: number;
  waiting: number;
  active: number;
  failed: number;
}

export interface DashboardSnapshot {
  generatedAt: string;
  queue: { totalDepth: number; queues: DashboardQueueMetric[] } | null;
  fraud: { open: number; investigating: number; highSeverityOpen: number } | null;
  properties: { total: number; active: number; createdLast24h: number } | null;
  transactions: {
    total: number;
    pending: number;
    completed: number;
    createdLast24h: number;
  } | null;
}

export const DASHBOARD_SNAPSHOT_KEY = 'analytics:dashboard:snapshot';
export const DASHBOARD_SNAPSHOT_TTL_SECONDS = 5;

@Injectable()
export class DashboardMetricsService {
  private readonly logger = new Logger(DashboardMetricsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
    private readonly queueMonitoring: QueueMonitoringService,
  ) {}

  /**
   * Return the current snapshot, served from a short-lived cache so a burst of
   * subscribers results in at most one computation per TTL window.
   */
  async getSnapshot(): Promise<DashboardSnapshot> {
    try {
      return await this.cacheService.getOrSet(
        DASHBOARD_SNAPSHOT_KEY,
        () => this.buildSnapshot(),
        DASHBOARD_SNAPSHOT_TTL_SECONDS,
      );
    } catch (error) {
      // Cache unavailable — compute directly rather than dropping the feed.
      this.logger.warn(
        `Dashboard snapshot cache unavailable, computing directly: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return this.buildSnapshot();
    }
  }

  /** Compute a fresh snapshot from the backing stores. */
  async buildSnapshot(): Promise<DashboardSnapshot> {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [queue, fraud, properties, transactions] = await Promise.all([
      this.collectQueue(),
      this.collectFraud(),
      this.collectProperties(since24h),
      this.collectTransactions(since24h),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      queue,
      fraud,
      properties,
      transactions,
    };
  }

  private async collectQueue(): Promise<DashboardSnapshot['queue']> {
    try {
      const { metrics } = await this.queueMonitoring.getQueueMetrics();
      const queues: DashboardQueueMetric[] = metrics.map((metric: any) => ({
        queue: metric.queue,
        depth: metric.depth ?? 0,
        waiting: metric.waiting ?? 0,
        active: metric.active ?? 0,
        failed: metric.failed ?? 0,
      }));
      return {
        totalDepth: queues.reduce((sum, queue) => sum + queue.depth, 0),
        queues,
      };
    } catch (error) {
      this.logger.warn(
        `Queue metrics unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  private async collectFraud(): Promise<DashboardSnapshot['fraud']> {
    try {
      const [open, investigating, highSeverityOpen] = await Promise.all([
        this.prisma.fraudAlert.count({ where: { status: FraudStatus.OPEN } }),
        this.prisma.fraudAlert.count({ where: { status: FraudStatus.INVESTIGATING } }),
        this.prisma.fraudAlert.count({
          where: {
            status: FraudStatus.OPEN,
            severity: { in: [FraudSeverity.HIGH, FraudSeverity.CRITICAL] },
          },
        }),
      ]);
      return { open, investigating, highSeverityOpen };
    } catch (error) {
      this.logger.warn(
        `Fraud metrics unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  private async collectProperties(since24h: Date): Promise<DashboardSnapshot['properties']> {
    try {
      const [total, active, createdLast24h] = await Promise.all([
        this.prisma.property.count({ where: { deleted: false } }),
        this.prisma.property.count({ where: { deleted: false, status: PropertyStatus.ACTIVE } }),
        this.prisma.property.count({ where: { deleted: false, createdAt: { gte: since24h } } }),
      ]);
      return { total, active, createdLast24h };
    } catch (error) {
      this.logger.warn(
        `Property metrics unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  private async collectTransactions(since24h: Date): Promise<DashboardSnapshot['transactions']> {
    try {
      const [total, pending, completed, createdLast24h] = await Promise.all([
        this.prisma.transaction.count(),
        this.prisma.transaction.count({ where: { status: TransactionStatus.PENDING } }),
        this.prisma.transaction.count({ where: { status: TransactionStatus.COMPLETED } }),
        this.prisma.transaction.count({ where: { createdAt: { gte: since24h } } }),
      ]);
      return { total, pending, completed, createdLast24h };
    } catch (error) {
      this.logger.warn(
        `Transaction metrics unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }
}
