/**
 * CleanupService
 *
 * Scheduled daily cleanup of expired / temporary database records.
 * Issue #920 – Automated cleanup of expired records (blacklisted tokens,
 *              sessions, reset tokens, login attempts).
 *
 * Runs via NestJS @Cron every day at 02:00 UTC.
 * Each entity type has a configurable retention period sourced from env vars.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from './prisma.service';
import { promises as fs } from 'fs';

/** Default retention periods (in days) for each record type. */
const DEFAULT_RETENTION = {
  blacklistedTokens: 7, // keep expired tokens for 7 days for audit purposes
  passwordResetTokens: 1, // reset tokens are short-lived
  sessions: 30, // keep session history for 30 days
  loginHistory: 90, // keep login history for 90 days
  searchAnalytics: 30, // per-search analytics rows (contain PII) – 30 days
  searchHistory: 30, // per-user search history – 30 days
  webhookDeliveryLogs: 30, // webhook delivery logs (issue #1295) – 30 days
  requestLogs: 7, // per-request analytics logs (issue #1296) – 7 days
} as const;

const BATCH_SIZE = 500;

interface CleanupResult {
  entity: string;
  deleted: number;
  durationMs: number;
}

interface CleanupSummary {
  ranAt: string;
  results: CleanupResult[];
  totalDeleted: number;
  totalDurationMs: number;
}

/** Singleton store for the last cleanup summary (surfaced by AdminController). */
let lastCleanupSummary: CleanupSummary | null = null;

export function getLastCleanupSummary(): CleanupSummary | null {
  return lastCleanupSummary;
}

@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Returns the summary of the most recent cleanup run. */
  getLastSummary(): CleanupSummary | null {
    return lastCleanupSummary;
  }

  /**
   * Main scheduled cleanup job.
   * Runs daily at 02:00 UTC to minimise impact on production traffic.
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async runDailyCleanup(): Promise<void> {
    this.logger.log('Starting daily cleanup of expired records…');
    const summary = await this.performCleanup();
    lastCleanupSummary = summary;

    this.logger.log(
      `Cleanup complete – deleted ${summary.totalDeleted} record(s) in ${summary.totalDurationMs}ms`,
    );
  }

  /**
   * Executes the full cleanup cycle and returns a summary.
   * Can also be called manually (e.g., from an admin endpoint).
   */
  async performCleanup(): Promise<CleanupSummary> {
    const now = new Date();
    const results: CleanupResult[] = [];

    results.push(await this.cleanBlacklistedTokens(now));
    results.push(await this.cleanPasswordResetTokens(now));
    results.push(await this.cleanExpiredSessions(now));
    results.push(await this.cleanOldLoginHistory(now));
    results.push(await this.cleanOldSearchAnalytics(now));
    results.push(await this.cleanOldSearchHistory(now));
    results.push(await this.cleanWebhookDeliveryLogs(now));
    results.push(await this.cleanRequestLogs(now));
    results.push(await this.cleanExportJobs(now));

    const summary: CleanupSummary = {
      ranAt: now.toISOString(),
      results,
      totalDeleted: results.reduce((sum, r) => sum + r.deleted, 0),
      totalDurationMs: results.reduce((sum, r) => sum + r.durationMs, 0),
    };

    return summary;
  }

  // ── Individual cleanup tasks ───────────────────────────────────────────────

  private async cleanBlacklistedTokens(now: Date): Promise<CleanupResult> {
    const start = Date.now();
    const retentionDays = parseInt(
      process.env.CLEANUP_BLACKLISTED_TOKEN_RETENTION_DAYS ??
        String(DEFAULT_RETENTION.blacklistedTokens),
      10,
    );

    const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
    let deleted = 0;

    // Batch delete to avoid long-running transactions
    let batch: number;
    do {
      const ids = await this.prisma.blacklistedToken.findMany({
        where: { expiresAt: { lt: cutoff } },
        select: { id: true },
        take: BATCH_SIZE,
      });

      if (ids.length === 0) break;

      const result = await this.prisma.blacklistedToken.deleteMany({
        where: { id: { in: ids.map((r) => r.id) } },
      });

      batch = result.count;
      deleted += batch;
    } while (batch === BATCH_SIZE);

    this.logger.log(
      `cleanBlacklistedTokens: removed ${deleted} record(s) (retention: ${retentionDays}d)`,
    );
    return { entity: 'BlacklistedToken', deleted, durationMs: Date.now() - start };
  }

  private async cleanPasswordResetTokens(now: Date): Promise<CleanupResult> {
    const start = Date.now();
    const retentionDays = parseInt(
      process.env.CLEANUP_PASSWORD_RESET_TOKEN_RETENTION_DAYS ??
        String(DEFAULT_RETENTION.passwordResetTokens),
      10,
    );

    const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
    let deleted = 0;

    let batch: number;
    do {
      const ids = await this.prisma.passwordResetToken.findMany({
        where: { expiresAt: { lt: cutoff } },
        select: { id: true },
        take: BATCH_SIZE,
      });

      if (ids.length === 0) break;

      const result = await this.prisma.passwordResetToken.deleteMany({
        where: { id: { in: ids.map((r) => r.id) } },
      });

      batch = result.count;
      deleted += batch;
    } while (batch === BATCH_SIZE);

    this.logger.log(
      `cleanPasswordResetTokens: removed ${deleted} record(s) (retention: ${retentionDays}d)`,
    );
    return { entity: 'PasswordResetToken', deleted, durationMs: Date.now() - start };
  }

  private async cleanExpiredSessions(now: Date): Promise<CleanupResult> {
    const start = Date.now();
    const retentionDays = parseInt(
      process.env.CLEANUP_SESSION_RETENTION_DAYS ?? String(DEFAULT_RETENTION.sessions),
      10,
    );

    const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
    let deleted = 0;

    let batch: number;
    do {
      const ids = await this.prisma.session.findMany({
        where: {
          AND: [{ expiresAt: { lt: cutoff } }, { isRevoked: true }],
        },
        select: { id: true },
        take: BATCH_SIZE,
      });

      if (ids.length === 0) break;

      const result = await this.prisma.session.deleteMany({
        where: { id: { in: ids.map((r) => r.id) } },
      });

      batch = result.count;
      deleted += batch;
    } while (batch === BATCH_SIZE);

    this.logger.log(
      `cleanExpiredSessions: removed ${deleted} record(s) (retention: ${retentionDays}d)`,
    );
    return { entity: 'Session', deleted, durationMs: Date.now() - start };
  }

  private async cleanOldLoginHistory(now: Date): Promise<CleanupResult> {
    const start = Date.now();
    const retentionDays = parseInt(
      process.env.CLEANUP_LOGIN_HISTORY_RETENTION_DAYS ?? String(DEFAULT_RETENTION.loginHistory),
      10,
    );

    const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
    let deleted = 0;

    let batch: number;
    do {
      const ids = await this.prisma.loginHistory.findMany({
        where: { timestamp: { lt: cutoff } },
        select: { id: true },
        take: BATCH_SIZE,
      });

      if (ids.length === 0) break;

      const result = await this.prisma.loginHistory.deleteMany({
        where: { id: { in: ids.map((r) => r.id) } },
      });

      batch = result.count;
      deleted += batch;
    } while (batch === BATCH_SIZE);

    this.logger.log(
      `cleanOldLoginHistory: removed ${deleted} record(s) (retention: ${retentionDays}d)`,
    );
    return { entity: 'LoginHistory', deleted, durationMs: Date.now() - start };
  }

  /**
   * Prune old SearchAnalytics rows (PII: userId, query, filters, IP) on a
   * shared search retention window (#1182). PopularSearch aggregates are kept.
   */
  private async cleanOldSearchAnalytics(now: Date): Promise<CleanupResult> {
    const start = Date.now();
    const retentionDays = parseInt(
      process.env.CLEANUP_SEARCH_RETENTION_DAYS ?? String(DEFAULT_RETENTION.searchAnalytics),
      10,
    );

    const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
    let deleted = 0;

    let batch: number;
    do {
      const ids = await this.prisma.searchAnalytics.findMany({
        where: { createdAt: { lt: cutoff } },
        select: { id: true },
        take: BATCH_SIZE,
      });

      if (ids.length === 0) break;

      const result = await this.prisma.searchAnalytics.deleteMany({
        where: { id: { in: ids.map((r) => r.id) } },
      });

      batch = result.count;
      deleted += batch;
    } while (batch === BATCH_SIZE);

    this.logger.log(
      `cleanOldSearchAnalytics: removed ${deleted} record(s) (retention: ${retentionDays}d)`,
    );
    return { entity: 'SearchAnalytics', deleted, durationMs: Date.now() - start };
  }

  /**
   * Prune old SearchHistory rows (PII: userId + query) on the same retention
   * window (#1182).
   */
  private async cleanOldSearchHistory(now: Date): Promise<CleanupResult> {
    const start = Date.now();
    const retentionDays = parseInt(
      process.env.CLEANUP_SEARCH_RETENTION_DAYS ?? String(DEFAULT_RETENTION.searchHistory),
      10,
    );

    const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
    let deleted = 0;

    let batch: number;
    do {
      const ids = await this.prisma.searchHistory.findMany({
        where: { lastSearched: { lt: cutoff } },
        select: { id: true },
        take: BATCH_SIZE,
      });

      if (ids.length === 0) break;

      const result = await this.prisma.searchHistory.deleteMany({
        where: { id: { in: ids.map((r) => r.id) } },
      });

      batch = result.count;
      deleted += batch;
    } while (batch === BATCH_SIZE);

    this.logger.log(
      `cleanOldSearchHistory: removed ${deleted} record(s) (retention: ${retentionDays}d)`,
    );
    return { entity: 'SearchHistory', deleted, durationMs: Date.now() - start };
  }

  /**
   * Prune old WebhookDeliveryLog rows (#1295) so delivery history stays
   * bounded. Shares `CLEANUP_WEBHOOK_LOG_DAYS` with the WebhooksService cron.
   */
  private async cleanWebhookDeliveryLogs(now: Date): Promise<CleanupResult> {
    const start = Date.now();
    const retentionDays = parseInt(
      process.env.CLEANUP_WEBHOOK_LOG_DAYS ?? String(DEFAULT_RETENTION.webhookDeliveryLogs),
      10,
    );

    const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
    let deleted = 0;

    let batch: number;
    do {
      const ids = await this.prisma.webhookDeliveryLog.findMany({
        where: { createdAt: { lt: cutoff } },
        select: { id: true },
        take: BATCH_SIZE,
      });

      if (ids.length === 0) break;

      const result = await this.prisma.webhookDeliveryLog.deleteMany({
        where: { id: { in: ids.map((r) => r.id) } },
      });

      batch = result.count;
      deleted += batch;
    } while (batch === BATCH_SIZE);

    this.logger.log(
      `cleanWebhookDeliveryLogs: removed ${deleted} record(s) (retention: ${retentionDays}d)`,
    );
    return { entity: 'WebhookDeliveryLog', deleted, durationMs: Date.now() - start };
  }

  /**
   * Prune old RequestLog rows (#1296) so per-request analytics stay bounded.
   * Retention is configurable via `CLEANUP_REQUESTLOG_DAYS`.
   */
  private async cleanRequestLogs(now: Date): Promise<CleanupResult> {
    const start = Date.now();
    const retentionDays = parseInt(
      process.env.CLEANUP_REQUESTLOG_DAYS ?? String(DEFAULT_RETENTION.requestLogs),
      10,
    );

    const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
    let deleted = 0;

    let batch: number;
    do {
      const ids = await this.prisma.requestLog.findMany({
        where: { timestamp: { lt: cutoff } },
        select: { id: true },
        take: BATCH_SIZE,
      });

      if (ids.length === 0) break;

      const result = await this.prisma.requestLog.deleteMany({
        where: { id: { in: ids.map((r) => r.id) } },
      });

      batch = result.count;
      deleted += batch;
    } while (batch === BATCH_SIZE);

    this.logger.log(
      `cleanRequestLogs: removed ${deleted} record(s) (retention: ${retentionDays}d)`,
    );
    return { entity: 'RequestLog', deleted, durationMs: Date.now() - start };
  }

  private async cleanExportJobs(now: Date): Promise<CleanupResult> {
    const start = Date.now();
    const retentionHours = parseInt(process.env.CLEANUP_EXPORT_JOB_RETENTION_HOURS ?? '24', 10);
    const cutoff = new Date(now.getTime() - retentionHours * 60 * 60 * 1000);
    let deleted = 0;

    const oldJobs = await this.prisma.exportJob.findMany({
      where: { createdAt: { lt: cutoff } },
      select: { id: true, fileUrl: true },
    });

    for (const job of oldJobs) {
      if (job.fileUrl) {
        try {
          await fs.unlink(job.fileUrl);
          await fs.unlink(`${job.fileUrl}.json`).catch(() => {});
        } catch {}
      }
    }

    if (oldJobs.length > 0) {
      const res = await this.prisma.exportJob.deleteMany({
        where: { id: { in: oldJobs.map((j) => j.id) } },
      });
      deleted = res.count;
    }

    this.logger.log(
      `cleanExportJobs: removed ${deleted} record(s) (retention: ${retentionHours}h)`,
    );
    return { entity: 'ExportJob', deleted, durationMs: Date.now() - start };
  }
}
