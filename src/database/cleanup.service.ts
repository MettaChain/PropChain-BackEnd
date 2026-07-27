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

/** Default retention periods (in days) for each record type. */
const DEFAULT_RETENTION = {
  blacklistedTokens: 7, // keep expired tokens for 7 days for audit purposes
  passwordResetTokens: 1, // reset tokens are short-lived
  sessions: 30, // keep session history for 30 days
  loginHistory: 90, // keep login history for 90 days
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
}
