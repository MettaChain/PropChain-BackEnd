// @ts-nocheck

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import Redis from 'ioredis';
import { PrismaService } from '../database/prisma.service';
import { getRedisConfig } from '../cache/cache.config';
import {
  analyticsRecordsWrittenTotal,
  analyticsWriteFailuresTotal,
} from '../metrics/metrics.controller';

export interface RequestRecord {
  endpoint: string;
  method: string;
  statusCode: number;
  responseTime: number;
  userId: string | null;
  timestamp: Date;
}

export interface EndpointStats {
  endpoint: string;
  requestCount: number;
  errorCount: number;
  errorRate: number;
  avgResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
}

export interface UserUsageStats {
  userId: string;
  requestCount: number;
  errorCount: number;
  avgResponseTime: number;
  lastSeen: Date;
}

export interface SlowEndpoint {
  endpoint: string;
  avgResponseTime: number;
  p95ResponseTime: number;
  requestCount: number;
}

export interface ApiMonitoringStats {
  window: string;
  totalRequests: number;
  totalErrors: number;
  overallErrorRate: number;
  avgResponseTime: number;
  requestsPerMinute: number;
  topEndpoints: EndpointStats[];
  slowEndpoints: SlowEndpoint[];
  errorsByStatus: Array<{ statusCode: number; count: number; rate: number }>;
  topUsers: UserUsageStats[];
}

/**
 * Default retention period in days for request logs.
 * Overridable via ANALYTICS_RETENTION_DAYS env var.
 */
const DEFAULT_RETENTION_DAYS = 7;

/**
 * Maximum number of records to buffer in memory before flushing to the database.
 * This amortises per-request DB writes while bounding memory usage.
 */
const MAX_BUFFER_SIZE = 500;

/**
 * How often (ms) the buffer is flushed even if below MAX_BUFFER_SIZE.
 */
const FLUSH_INTERVAL_MS = 5_000;

/**
 * Redis list used to coalesce request-log writes (issue #1296). Only active
 * when `ANALYTICS_USE_REDIS_BUFFER=true` (or in production unless explicitly
 * disabled), so local/test runs keep the in-memory buffer only.
 */
const REDIS_BUFFER_KEY = 'analytics:requestlogs:buffer';

@Injectable()
export class AnalyticsService implements OnModuleDestroy {
  private readonly logger = new Logger(AnalyticsService.name);

  /** Write buffer – flushed to the database in batches. */
  private buffer: Array<{
    endpoint: string;
    method: string;
    statusCode: number;
    responseTime: number;
    userId: string | null;
    timestamp: Date;
  }> = [];

  /** Timer handle for periodic flushes. */
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  /** Whether the service has been destroyed (stops flushes). */
  private destroyed = false;

  /** Optional Redis client used to coalesce writes across replicas. */
  private redis: Redis | null = null;

  // Slow endpoint threshold in ms
  private readonly SLOW_THRESHOLD_MS = 1000;

  /** Retention period in days – read once from env. */
  private readonly retentionDays: number;

  constructor(private readonly prisma: PrismaService) {
    this.retentionDays = parseInt(
      process.env.ANALYTICS_RETENTION_DAYS ?? String(DEFAULT_RETENTION_DAYS),
      10,
    );

    // Redis-backed coalescing (#1296). Disabled by default; enabled explicitly
    // or in production unless opted out.
    const redisBufferFlag = process.env.ANALYTICS_USE_REDIS_BUFFER;
    const redisBufferEnabled =
      redisBufferFlag === 'true' ||
      (process.env.NODE_ENV === 'production' && redisBufferFlag !== 'false');

    if (redisBufferEnabled) {
      try {
        const config = getRedisConfig();
        this.redis = new Redis({
          host: config.host,
          port: config.port,
          password: config.password,
          db: config.db,
          retryStrategy: config.retryStrategy as any,
          maxRetriesPerRequest: 3,
          enableReadyCheck: true,
          lazyConnect: true,
        });
        this.redis.connect().catch((err) => {
          this.logger.warn(
            `Analytics Redis buffer unavailable, falling back to memory: ${err?.message ?? err}`,
          );
        });
      } catch (err) {
        this.logger.warn(`Could not initialise analytics Redis buffer: ${err}`);
        this.redis = null;
      }
    }

    // Start periodic flush timer
    this.flushTimer = setInterval(() => {
      this.flush().catch((err) => {
        this.logger.error('Failed to flush analytics buffer', err.stack);
      });
    }, FLUSH_INTERVAL_MS);

    // Allow the process to exit without waiting for the timer
    if (this.flushTimer.unref) {
      this.flushTimer.unref();
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.destroyed = true;
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    // Flush any remaining records before shutdown
    await this.flush();

    if (this.redis) {
      try {
        await this.redis.quit();
      } catch {
        this.redis.disconnect();
      }
      this.redis = null;
    }
  }

  // ── Write path ──────────────────────────────────────────────────────────

  record(data: Omit<RequestRecord, 'timestamp'>): void {
    const record = { ...data, timestamp: new Date() };

    // Coalesce into a Redis list when enabled so writes survive restarts and
    // are shared across replicas (#1296).
    if (this.redis && !this.destroyed) {
      this.redis.rpush(REDIS_BUFFER_KEY, JSON.stringify(record)).catch((err) => {
        analyticsWriteFailuresTotal.inc({ stage: 'buffer' });
        this.logger.error('Failed to append analytics record to Redis buffer', err?.stack);
        // Preserve the record in memory so it is not lost.
        this.buffer.push(record);
      });
      return;
    }

    this.buffer.push(record);

    // Synchronous flush when buffer is full
    if (this.buffer.length >= MAX_BUFFER_SIZE) {
      // Fire-and-forget; the periodic timer also handles this,
      // but we trigger eagerly to avoid exceeding the limit.
      this.flush().catch((err) => {
        this.logger.error('Failed to flush analytics buffer', err.stack);
      });
    }
  }

  /**
   * Flush buffered records to the database in a single batch insert.
   * Idempotent: no-ops when the buffer is empty.
   */
  async flush(): Promise<void> {
    const records = this.buffer.splice(0, this.buffer.length);
    let source = 'memory';

    // Drain the Redis coalescing list first, if in use.
    if (this.redis) {
      try {
        const raw = await this.redis.lrange(REDIS_BUFFER_KEY, 0, -1);
        if (raw.length > 0) {
          await this.redis.ltrim(REDIS_BUFFER_KEY, raw.length, -1);
          source = 'redis';
          for (const entry of raw) {
            try {
              records.push(JSON.parse(entry));
            } catch {
              // Skip malformed entries rather than blocking the whole flush.
            }
          }
        }
      } catch (err) {
        analyticsWriteFailuresTotal.inc({ stage: 'buffer' });
        this.logger.error('Failed to drain Redis analytics buffer', err?.stack);
      }
    }

    if (records.length === 0) return;

    try {
      await this.prisma.requestLog.createMany({ data: records });
      analyticsRecordsWrittenTotal.inc({ source }, records.length);
    } catch (err) {
      analyticsWriteFailuresTotal.inc({ stage: 'flush' });
      this.logger.error(`Failed to persist ${records.length} analytics records`, err.stack);
      // Re-prepend the records so they are retried on the next flush
      this.buffer.unshift(...records);
    }
  }

  /**
   * Periodic flush of coalesced request logs (issue #1296). Complements the
   * in-process timer by also draining the Redis buffer on a fixed cadence.
   */
  @Cron(CronExpression.EVERY_10_SECONDS)
  async flushBufferedRecords(): Promise<void> {
    await this.flush();
  }

  // ── Read path ───────────────────────────────────────────────────────────

  /**
   * Returns records within the given time window (minutes).
   * Defaults to last 60 minutes.
   */
  private async getWindowedRecords(windowMinutes = 60): Promise<RequestRecord[]> {
    const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000);

    const rows = await this.prisma.requestLog.findMany({
      where: { timestamp: { gte: cutoff } },
      orderBy: { timestamp: 'asc' },
    });

    return rows.map((r) => ({
      endpoint: r.endpoint,
      method: r.method,
      statusCode: r.statusCode,
      responseTime: r.responseTime,
      userId: r.userId,
      timestamp: r.timestamp,
    }));
  }

  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  }

  async getStats(windowMinutes = 60): Promise<ApiMonitoringStats> {
    const records = await this.getWindowedRecords(windowMinutes);
    const total = records.length;

    if (total === 0) {
      return {
        window: `${windowMinutes}m`,
        totalRequests: 0,
        totalErrors: 0,
        overallErrorRate: 0,
        avgResponseTime: 0,
        requestsPerMinute: 0,
        topEndpoints: [],
        slowEndpoints: [],
        errorsByStatus: [],
        topUsers: [],
      };
    }

    // --- Aggregate by endpoint ---
    const endpointMap = new Map<string, { count: number; errors: number; times: number[] }>();

    // --- Aggregate by user ---
    const userMap = new Map<
      string,
      { count: number; errors: number; totalTime: number; lastSeen: Date }
    >();

    // --- Aggregate by status code ---
    const statusMap = new Map<number, number>();

    let totalTime = 0;
    let totalErrors = 0;

    for (const r of records) {
      const key = `${r.method} ${r.endpoint}`;
      const ep = endpointMap.get(key) ?? { count: 0, errors: 0, times: [] };
      ep.count++;
      ep.times.push(r.responseTime);
      if (r.statusCode >= 400) ep.errors++;
      endpointMap.set(key, ep);

      totalTime += r.responseTime;
      if (r.statusCode >= 400) totalErrors++;

      statusMap.set(r.statusCode, (statusMap.get(r.statusCode) ?? 0) + 1);

      if (r.userId) {
        const u = userMap.get(r.userId) ?? {
          count: 0,
          errors: 0,
          totalTime: 0,
          lastSeen: r.timestamp,
        };
        u.count++;
        u.totalTime += r.responseTime;
        if (r.statusCode >= 400) u.errors++;
        if (r.timestamp > u.lastSeen) u.lastSeen = r.timestamp;
        userMap.set(r.userId, u);
      }
    }

    // --- Build endpoint stats ---
    const endpointStats: EndpointStats[] = [...endpointMap.entries()].map(
      ([endpoint, { count, errors, times }]) => {
        const sorted = [...times].sort((a, b) => a - b);
        return {
          endpoint,
          requestCount: count,
          errorCount: errors,
          errorRate: parseFloat(((errors / count) * 100).toFixed(2)),
          avgResponseTime: Math.round(times.reduce((a, b) => a + b, 0) / count),
          p95ResponseTime: this.percentile(sorted, 95),
          p99ResponseTime: this.percentile(sorted, 99),
        };
      },
    );

    const topEndpoints = [...endpointStats]
      .sort((a, b) => b.requestCount - a.requestCount)
      .slice(0, 10);

    const slowEndpoints: SlowEndpoint[] = endpointStats
      .filter((e) => e.avgResponseTime >= this.SLOW_THRESHOLD_MS)
      .sort((a, b) => b.avgResponseTime - a.avgResponseTime)
      .slice(0, 10)
      .map(({ endpoint, avgResponseTime, p95ResponseTime, requestCount }) => ({
        endpoint,
        avgResponseTime,
        p95ResponseTime,
        requestCount,
      }));

    // --- Error breakdown by status ---
    const errorsByStatus = [...statusMap.entries()]
      .filter(([code]) => code >= 400)
      .map(([statusCode, count]) => ({
        statusCode,
        count,
        rate: parseFloat(((count / total) * 100).toFixed(2)),
      }))
      .sort((a, b) => b.count - a.count);

    // --- Top users by request count ---
    const topUsers: UserUsageStats[] = [...userMap.entries()]
      .map(([userId, { count, errors, totalTime: ut, lastSeen }]) => ({
        userId,
        requestCount: count,
        errorCount: errors,
        avgResponseTime: Math.round(ut / count),
        lastSeen,
      }))
      .sort((a, b) => b.requestCount - a.requestCount)
      .slice(0, 20);

    const windowMs = windowMinutes * 60 * 1000;
    const requestsPerMinute = parseFloat(((total / windowMs) * 60000).toFixed(2));

    return {
      window: `${windowMinutes}m`,
      totalRequests: total,
      totalErrors,
      overallErrorRate: parseFloat(((totalErrors / total) * 100).toFixed(2)),
      avgResponseTime: Math.round(totalTime / total),
      requestsPerMinute,
      topEndpoints,
      slowEndpoints,
      errorsByStatus,
      topUsers,
    };
  }

  /**
   * Per-endpoint breakdown with full stats.
   */
  async getEndpointStats(windowMinutes = 60): Promise<EndpointStats[]> {
    const stats = await this.getStats(windowMinutes);
    return stats.topEndpoints;
  }

  /**
   * Usage breakdown for a specific user.
   */
  async getUserStats(userId: string, windowMinutes = 60): Promise<UserUsageStats | null> {
    const records = (await this.getWindowedRecords(windowMinutes)).filter(
      (r) => r.userId === userId,
    );
    if (records.length === 0) return null;

    const errors = records.filter((r) => r.statusCode >= 400).length;
    const totalTime = records.reduce((s, r) => s + r.responseTime, 0);
    const lastSeen = records.reduce(
      (latest, r) => (r.timestamp > latest ? r.timestamp : latest),
      records[0].timestamp,
    );

    return {
      userId,
      requestCount: records.length,
      errorCount: errors,
      avgResponseTime: Math.round(totalTime / records.length),
      lastSeen,
    };
  }

  /**
   * Delete all request log records.
   */
  async reset(): Promise<void> {
    this.buffer.splice(0, this.buffer.length);
    await this.prisma.requestLog.deleteMany();
  }

  // ── Retention cleanup ───────────────────────────────────────────────────

  /**
   * Scheduled daily cleanup of request logs older than the retention period.
   * Runs at 03:00 UTC to avoid overlap with CleanupService (02:00 UTC).
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async pruneExpiredRecords(): Promise<void> {
    const cutoff = new Date(Date.now() - this.retentionDays * 24 * 60 * 60 * 1000);

    const result = await this.prisma.requestLog.deleteMany({
      where: { timestamp: { lt: cutoff } },
    });

    if (result.count > 0) {
      this.logger.log(
        `Pruned ${result.count} expired request log records (retention: ${this.retentionDays}d)`,
      );
    }
  }
}
