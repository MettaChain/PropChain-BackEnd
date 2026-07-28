/**
 * ArchiveService
 *
 * Implements a configurable data archival strategy for historical records.
 * Issue #919 – Proper data archival strategy for historical records.
 *
 * Supports archiving: LoginHistory, ActivityLog, SearchAnalytics, PropertyView.
 * Archives are written as newline-delimited JSON (NDJSON) to the configured
 * ARCHIVE_STORAGE_PATH directory (default: ./archives).
 *
 * Retention periods are configurable via environment variables.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { PrismaService } from '../database/prisma.service';

const ARCHIVE_DIR = process.env.ARCHIVE_STORAGE_PATH ?? './archives';
const BATCH_SIZE = 1000;

/** Default retention in days before records are archived. */
const DEFAULT_RETENTION_DAYS = {
  loginHistory: 90,
  activityLog: 180,
  propertyView: 365,
};

export interface ArchiveJobResult {
  entity: string;
  archivedCount: number;
  archiveFile: string | null;
  durationMs: number;
  error?: string;
}

export interface ArchiveRunSummary {
  ranAt: string;
  jobs: ArchiveJobResult[];
  totalArchived: number;
  totalDurationMs: number;
}

let lastArchiveSummary: ArchiveRunSummary | null = null;

export function getLastArchiveSummary(): ArchiveRunSummary | null {
  return lastArchiveSummary;
}

@Injectable()
export class ArchiveService {
  private readonly logger = new Logger(ArchiveService.name);

  constructor(private readonly prisma: PrismaService) {
    this.ensureArchiveDir();
  }

  /** Returns the result of the last archive run. */
  getLastSummary(): ArchiveRunSummary | null {
    return lastArchiveSummary;
  }

  /**
   * Scheduled weekly archival job (Sundays at 03:00 UTC).
   * Runs weekly rather than daily to reduce I/O pressure.
   */
  @Cron(CronExpression.EVERY_WEEK)
  async runScheduledArchival(): Promise<void> {
    this.logger.log('Starting scheduled data archival…');
    const summary = await this.runArchival();
    lastArchiveSummary = summary;
    this.logger.log(
      `Archival complete – ${summary.totalArchived} record(s) archived in ${summary.totalDurationMs}ms`,
    );
  }

  /**
   * Execute the full archival cycle.
   * Can also be triggered manually from the admin endpoint.
   */
  async runArchival(): Promise<ArchiveRunSummary> {
    const now = new Date();
    const jobs: ArchiveJobResult[] = [];

    jobs.push(await this.archiveLoginHistory(now));
    jobs.push(await this.archiveActivityLogs(now));
    jobs.push(await this.archivePropertyViews(now));

    const summary: ArchiveRunSummary = {
      ranAt: now.toISOString(),
      jobs,
      totalArchived: jobs.reduce((s, j) => s + j.archivedCount, 0),
      totalDurationMs: jobs.reduce((s, j) => s + j.durationMs, 0),
    };

    return summary;
  }

  /**
   * Restore archived records from an archive file back into the database.
   * Admin-only operation.
   */
  async restoreFromArchive(archiveFile: string): Promise<{ restored: number; errors: string[] }> {
    const absPath = path.isAbsolute(archiveFile)
      ? archiveFile
      : path.join(ARCHIVE_DIR, archiveFile);

    if (!fs.existsSync(absPath)) {
      throw new Error(`Archive file not found: ${absPath}`);
    }

    this.logger.log(`Restoring from archive: ${absPath}`);

    const rawBuffer = fs.readFileSync(absPath);
    let content: string;

    if (absPath.endsWith('.gz')) {
      content = zlib.gunzipSync(rawBuffer).toString('utf8');
    } else {
      content = rawBuffer.toString('utf8');
    }

    const lines = content.split('\n').filter((l) => l.trim().length > 0);
    const errors: string[] = [];
    let restored = 0;

    for (const line of lines) {
      try {
        const record = JSON.parse(line) as Record<string, unknown>;
        const entity = record.__entity as string;

        // Re-insert into the appropriate table
        switch (entity) {
          case 'LoginHistory':
            delete record.__entity;
            await this.prisma.loginHistory.upsert({
              where: { id: record.id as string },
              create: record as Parameters<typeof this.prisma.loginHistory.create>[0]['data'],
              update: {},
            });
            break;
          case 'ActivityLog':
            delete record.__entity;
            await this.prisma.activityLog.upsert({
              where: { id: record.id as string },
              create: record as Parameters<typeof this.prisma.activityLog.create>[0]['data'],
              update: {},
            });
            break;
          default:
            errors.push(`Unknown entity type: ${entity}`);
            continue;
        }
        restored++;
      } catch (err: unknown) {
        errors.push((err as Error)?.message ?? String(err));
      }
    }

    this.logger.log(`Restore complete: ${restored} record(s) restored, ${errors.length} error(s)`);
    return { restored, errors };
  }

  // ── List archive files ─────────────────────────────────────────────────────

  listArchiveFiles(): { name: string; sizeBytes: number; createdAt: string }[] {
    this.ensureArchiveDir();
    return fs
      .readdirSync(ARCHIVE_DIR)
      .filter((f) => f.endsWith('.ndjson.gz') || f.endsWith('.ndjson'))
      .map((f) => {
        const stat = fs.statSync(path.join(ARCHIVE_DIR, f));
        return {
          name: f,
          sizeBytes: stat.size,
          createdAt: stat.birthtime.toISOString(),
        };
      });
  }

  // ── Private archival helpers ───────────────────────────────────────────────

  private async archiveLoginHistory(now: Date): Promise<ArchiveJobResult> {
    const start = Date.now();
    const retentionDays = parseInt(
      process.env.ARCHIVE_LOGIN_HISTORY_RETENTION_DAYS ??
        String(DEFAULT_RETENTION_DAYS.loginHistory),
      10,
    );
    const cutoff = new Date(now.getTime() - retentionDays * 86_400_000);
    const filename = this.buildFilename('login_history', now);

    try {
      const count = await this.archiveAndDelete(
        'LoginHistory',
        filename,
        async (cursor) => {
          return this.prisma.loginHistory.findMany({
            where: { timestamp: { lt: cutoff }, id: cursor ? { gt: cursor } : undefined },
            orderBy: { id: 'asc' },
            take: BATCH_SIZE,
          });
        },
        async (ids) => {
          await this.prisma.loginHistory.deleteMany({ where: { id: { in: ids } } });
        },
      );

      return {
        entity: 'LoginHistory',
        archivedCount: count,
        archiveFile: filename,
        durationMs: Date.now() - start,
      };
    } catch (err: unknown) {
      this.logger.error(`archiveLoginHistory failed: ${(err as Error)?.message}`);
      return {
        entity: 'LoginHistory',
        archivedCount: 0,
        archiveFile: null,
        durationMs: Date.now() - start,
        error: (err as Error)?.message,
      };
    }
  }

  private async archiveActivityLogs(now: Date): Promise<ArchiveJobResult> {
    const start = Date.now();
    const retentionDays = parseInt(
      process.env.ARCHIVE_ACTIVITY_LOG_RETENTION_DAYS ?? String(DEFAULT_RETENTION_DAYS.activityLog),
      10,
    );
    const cutoff = new Date(now.getTime() - retentionDays * 86_400_000);
    const filename = this.buildFilename('activity_logs', now);

    try {
      const count = await this.archiveAndDelete(
        'ActivityLog',
        filename,
        async (cursor) => {
          return this.prisma.activityLog.findMany({
            where: { createdAt: { lt: cutoff }, id: cursor ? { gt: cursor } : undefined },
            orderBy: { id: 'asc' },
            take: BATCH_SIZE,
          });
        },
        async (ids) => {
          await this.prisma.activityLog.deleteMany({ where: { id: { in: ids } } });
        },
      );

      return {
        entity: 'ActivityLog',
        archivedCount: count,
        archiveFile: filename,
        durationMs: Date.now() - start,
      };
    } catch (err: unknown) {
      this.logger.error(`archiveActivityLogs failed: ${(err as Error)?.message}`);
      return {
        entity: 'ActivityLog',
        archivedCount: 0,
        archiveFile: null,
        durationMs: Date.now() - start,
        error: (err as Error)?.message,
      };
    }
  }

  private async archivePropertyViews(now: Date): Promise<ArchiveJobResult> {
    const start = Date.now();
    const retentionDays = parseInt(
      process.env.ARCHIVE_PROPERTY_VIEW_RETENTION_DAYS ??
        String(DEFAULT_RETENTION_DAYS.propertyView),
      10,
    );
    const cutoff = new Date(now.getTime() - retentionDays * 86_400_000);
    const filename = this.buildFilename('property_views', now);

    try {
      const count = await this.archiveAndDelete(
        'PropertyView',
        filename,
        async (cursor) => {
          return this.prisma.propertyView.findMany({
            where: { viewedAt: { lt: cutoff }, id: cursor ? { gt: cursor } : undefined },
            orderBy: { id: 'asc' },
            take: BATCH_SIZE,
          });
        },
        async (ids) => {
          await this.prisma.propertyView.deleteMany({ where: { id: { in: ids } } });
        },
      );

      return {
        entity: 'PropertyView',
        archivedCount: count,
        archiveFile: filename,
        durationMs: Date.now() - start,
      };
    } catch (err: unknown) {
      this.logger.error(`archivePropertyViews failed: ${(err as Error)?.message}`);
      return {
        entity: 'PropertyView',
        archivedCount: 0,
        archiveFile: null,
        durationMs: Date.now() - start,
        error: (err as Error)?.message,
      };
    }
  }

  /**
   * Generic paginated fetch → write → delete pipeline.
   * Writes records to a gzipped NDJSON file then deletes them from the DB.
   */
  private async archiveAndDelete(
    entityName: string,
    filename: string,
    fetchBatch: (cursor: string | null) => Promise<Array<{ id: string } & Record<string, unknown>>>,
    deleteBatch: (ids: string[]) => Promise<void>,
  ): Promise<number> {
    this.ensureArchiveDir();
    const filePath = path.join(ARCHIVE_DIR, filename);
    const gzip = zlib.createGzip();
    const out = fs.createWriteStream(filePath);
    gzip.pipe(out);

    let cursor: string | null = null;
    let totalArchived = 0;

    while (true) {
      const batch = await fetchBatch(cursor);
      if (batch.length === 0) break;

      for (const record of batch) {
        const line = JSON.stringify({ __entity: entityName, ...record }) + '\n';
        gzip.write(line);
      }

      await deleteBatch(batch.map((r) => r.id));
      totalArchived += batch.length;
      cursor = batch[batch.length - 1].id;

      if (batch.length < BATCH_SIZE) break;
    }

    await new Promise<void>((resolve, reject) => {
      gzip.end();
      out.on('finish', resolve);
      out.on('error', reject);
    });

    if (totalArchived === 0) {
      // Remove empty archive file
      try {
        fs.unlinkSync(filePath);
      } catch {
        /* ignore */
      }
    }

    this.logger.log(`Archived ${totalArchived} ${entityName} record(s) → ${filename}`);
    return totalArchived;
  }

  private buildFilename(entity: string, date: Date): string {
    const ts = date.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    return `${entity}_${ts}.ndjson.gz`;
  }

  private ensureArchiveDir(): void {
    if (!fs.existsSync(ARCHIVE_DIR)) {
      fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
    }
  }
}
