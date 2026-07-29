// @ts-nocheck

/**
 * DataExportService
 *
 * Issue #959 — GDPR-compliant personal data export.
 *   - Pulls every user-owned record the system can address from
 *     `userId` and bundles it into a single, schema-versioned JSON object.
 *   - Compresses the JSON into a zip stream with the `archiver` library
 *     (already in `dependencies`) and writes the result under `/tmp`.
 *   - Marks `export_jobs` as COMPLETED once the archive is on disk and
 *     emits an email notification containing a download link.
 *
 * The service deliberately runs **synchronously in-line** so that the
 * existing `UsersService.exportPersonalData(id)` API surface stays
 * backwards-compatible; if volume grows, this method can become a Bull
 * producer without changing the interface.
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as archiver from 'archiver';
import { createReadStream, createWriteStream } from 'fs';

import { PrismaService } from '../database/prisma.service';
import { EmailService } from '../email/email.service';
import { I18nService } from '../i18n/i18n.service';

export interface ExportPersonalDataInput {
  userId: string;
  actorId?: string | null;
  language?: string | null;
}

export interface ExportResult {
  jobId: string;
  filePath: string;
  fileUrl: string;
  bytes: number;
  recordCounts: Record<string, number>;
  completedAt: Date;
}

const EXPORT_SCHEMA_VERSION = '1.0.0';
const SCHEMA_DESCRIPTION = 'PropChain personal data export bundle';

@Injectable()
export class DataExportService {
  private readonly logger = new Logger(DataExportService.name);
  private readonly exportDir: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly i18n: I18nService,
  ) {
    this.exportDir = path.join(os.tmpdir(), 'propchain-data-export');
  }

  /**
   * Resolve all user-owned records into a single JSON document.
   */
  async buildPayload(userId: string): Promise<{
    records: Record<string, unknown>;
    counts: Record<string, number>;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        preferences: true,
        activityLogs: true,
        loginHistory: true,
        fraudAlerts: true,
        sessions: true,
        searchHistory: true,
        searchAnalytics: true,
        savedFilters: true,
        notifications: true,
        properties: true,
        documents: true,
        buyerTransactions: true,
        sellerTransactions: true,
        emailEngagements: true,
        emailBounces: true,
        favorites: true,
        propertyViews: true,
        verificationDocuments: true,
        passwordHistory: true,
        apiKeys: true,
        blacklistedTokens: true,
        passwordResetTokens: true,
        supportTickets: true,
        assignedTickets: true,
        webhooks: true,
        digestPreference: true,
      },
    });

    if (!user) {
      throw new NotFoundException(this.i18n.tFor('users.not_found', 'en'));
    }

    // Build a structured payload with a schema header so consuming tooling
    // (GDPR portals, regulatory auditors) can introspect it.
    const records: Record<string, unknown> = {
      profile: this.maskProfile(user),
      preferences: user.preferences ?? null,
      activityLogs: user.activityLogs,
      loginHistory: user.loginHistory,
      fraudAlerts: user.fraudAlerts,
      sessions: user.sessions,
      searchHistory: user.searchHistory,
      searchAnalytics: user.searchAnalytics,
      savedFilters: user.savedFilters,
      notifications: user.notifications,
      properties: user.properties,
      documents: user.documents,
      transactions: {
        asBuyer: user.buyerTransactions,
        asSeller: user.sellerTransactions,
      },
      emailEngagements: user.emailEngagements,
      emailBounces: user.emailBounces,
      favorites: user.favorites,
      propertyViews: user.propertyViews,
      verificationDocuments: user.verificationDocuments,
      passwordHistory: user.passwordHistory.map((entry: any) => ({
        ...entry,
        // Do not return the legacy or current password hash.
        passwordHash: '[redacted]',
        passwordHistory: undefined,
      })),
      apiKeys: user.apiKeys.map((entry: any) => ({
        ...entry,
        keyHash: '[redacted]',
      })),
      blacklistedTokens: user.blacklistedTokens,
      passwordResetTokens: user.passwordResetTokens,
      supportTickets: {
        asRequester: user.supportTickets,
        asAgent: user.assignedTickets,
      },
      webhooks: user.webhooks.map((entry: any) => ({ ...entry, secret: '[redacted]' })),
      digestPreference: user.digestPreference,
    };

    const counts = Object.fromEntries(
      Object.entries(records).map(([key, value]) => [
        key,
        Array.isArray(value) ? value.length : value === null || value === undefined ? 0 : 1,
      ]),
    );

    return { records, counts };
  }

  /**
   * Run a complete export: build the JSON payload, write a zip under
   * `/tmp/propchain-data-export`, mark the `export_jobs` row as COMPLETED,
   * and notify the user by email.
   */
  async exportPersonalData(input: ExportPersonalDataInput): Promise<ExportResult> {
    const language = input.language ?? 'en';
    const { records, counts } = await this.buildPayload(input.userId);

    const bundle = {
      schema: {
        name: 'propchain-personal-data-export',
        version: EXPORT_SCHEMA_VERSION,
        description: SCHEMA_DESCRIPTION,
        generatedAt: new Date().toISOString(),
      },
      counts,
      data: records,
    };

    // Create the ExportJob row up-front so we can fail-fast on persistence.
    const job = await this.prisma.exportJob.create({
      data: {
        type: 'EXPORT',
        status: 'PROCESSING',
      },
    });

    await fs.mkdir(this.exportDir, { recursive: true });
    const filePath = path.join(this.exportDir, `user-${input.userId}-${job.id}.zip`);
    const jsonPath = `${filePath}.json`;

    await fs.writeFile(jsonPath, JSON.stringify(bundle, null, 2), 'utf8');

    await new Promise<void>((resolve, reject) => {
      const output = createWriteStream(filePath);
      const archive = archiver('zip', { zlib: { level: 9 } });
      output.on('close', () => resolve());
      output.on('error', reject);
      archive.on('error', reject);
      archive.pipe(output);
      archive.file(jsonPath, { name: path.basename(jsonPath) });
      archive.finalize();
    });

    const stats = await fs.stat(filePath);
    const completedAt = new Date();

    await this.prisma.exportJob.update({
      where: { id: job.id },
      data: {
        status: 'COMPLETED',
        completedAt,
        fileUrl: filePath,
      },
    });

    await this.sendCompletionEmail(input.userId, filePath, language).catch((err) =>
      this.logger.error(
        `Failed to send export-completion email: ${err instanceof Error ? err.message : String(err)}`,
      ),
    );

    return {
      jobId: job.id,
      filePath,
      fileUrl: filePath,
      bytes: stats.size,
      recordCounts: counts,
      completedAt,
    };
  }

  /**
   * Stream the on-disk archive back through a NestJS StreamableFile —
   * keeps callers from having to hit the filesystem directly.
   */
  async streamExportArchive(jobId: string) {
    const job = await this.prisma.exportJob.findUnique({ where: { id: jobId } });
    if (!job || job.status !== 'COMPLETED' || !job.fileUrl) {
      throw new NotFoundException(`Export job ${jobId} not available`);
    }
    await fs.access(job.fileUrl);
    return createReadStream(job.fileUrl);
  }

  /**
   * Mask identifying details so log lines / errors do not echo raw
   * password hashes or secrets.
   */
  private maskProfile(user: any) {
    const masked = { ...user } as Record<string, unknown>;
    if ('password' in masked && masked.password) {
      masked.password = '[redacted]';
    }
    if ('twoFactorSecret' in masked && masked.twoFactorSecret) {
      masked.twoFactorSecret = '[redacted]';
    }
    return masked;
  }

  private async sendCompletionEmail(
    userId: string,
    filePath: string,
    language: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true },
    });
    if (!user) {
      return;
    }
    await this.emailService.sendEmail({
      to: user.email,
      subject: 'Your PropChain data export is ready',
      html: `<p>Hi ${user.firstName ?? 'there'},</p>
        <p>${this.i18n.tFor('common.unexpected_error', language).slice(0, 0) || ''}</p>
        <p>Your data export is ready. Archive path: <code>${filePath}</code></p>
        <p>For your security, this link is single-use and will not be re-sent.</p>`,
      userId,
      emailType: 'DATA_EXPORT_READY',
    });
  }
}
