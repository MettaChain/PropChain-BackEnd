// @ts-nocheck

/**
 * AccountDeletionService
 *
 * Implements the self-service deletion workflow for issue #960:
 *   - Request deletion (sets `isDeactivated=true` + `scheduledDeletionAt`)
 *   - Cancel a pending deletion request before retention runs out
 *   - Hard-delete deactivated users when `scheduledDeletionAt` has passed
 *   - Legal-hold override (`legalHold=true` skips deletion always)
 *   - Audit log entries for every state transition
 *
 * Retention defaults are configurable via the
 * `ACCOUNT_DELETION_RETENTION_DAYS` env variable (default: 30 days,
 * bounded by `MIN_RETENTION_DAYS` and `MAX_RETENTION_DAYS`).
 */

import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../database/prisma.service';
import { EmailService } from '../email/email.service';
import { I18nService } from '../i18n/i18n.service';

const DEFAULT_RETENTION_DAYS = 30;
const MIN_RETENTION_DAYS = 7;
const MAX_RETENTION_DAYS = 90;

const DELETION_AUDIT_ACTIONS = {
  REQUESTED: 'REQUESTED',
  CANCELLED: 'CANCELLED',
  PERFORMED: 'PERFORMED',
  RESTORED: 'RESTORED',
  LEGAL_HOLD_BLOCKED: 'LEGAL_HOLD_BLOCKED',
  RESTORATION_FAILED: 'RESTORATION_FAILED',
} as const;

export interface RequestAccountDeletionInput {
  userId: string;
  actorId?: string | null;
  retentionDays?: number;
  reason?: string | null;
  language?: string | null;
}

export interface CancelAccountDeletionInput {
  userId: string;
  actorId?: string | null;
  language?: string | null;
}

export interface DeletionJobResult {
  deletedCount: number;
  blockedByLegalHold: number;
  restoredCount?: number;
}

@Injectable()
export class AccountDeletionService {
  private readonly logger = new Logger(AccountDeletionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly i18n: I18nService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Returns the configured retention window in days. Uses
   * `ACCOUNT_DELETION_RETENTION_DAYS` env if it parses to a valid integer
   * inside [MIN_RETENTION_DAYS, MAX_RETENTION_DAYS].
   */
  getDefaultRetentionDays(): number {
    const raw = this.configService.get<string | number>('ACCOUNT_DELETION_RETENTION_DAYS');
    const parsed = typeof raw === 'string' ? Number.parseInt(raw, 10) : raw;
    if (typeof parsed !== 'number' || Number.isNaN(parsed)) {
      return DEFAULT_RETENTION_DAYS;
    }
    return Math.min(MAX_RETENTION_DAYS, Math.max(MIN_RETENTION_DAYS, parsed));
  }

  /**
   * Validates and clamps a caller-supplied retention window.
   */
  resolveRetentionDays(requested?: number): number {
    const fallback = this.getDefaultRetentionDays();
    if (typeof requested !== 'number' || Number.isNaN(requested)) {
      return fallback;
    }
    return Math.min(MAX_RETENTION_DAYS, Math.max(MIN_RETENTION_DAYS, Math.floor(requested)));
  }

  /**
   * Initiate self-service account deletion. The user is deactivated and
   * scheduled to be permanently removed after the retention window. Email
   * confirmation is sent before the grace period ends. Throws if the user
   * is on legal hold or already has a pending deletion.
   */
  async requestDeletion(input: RequestAccountDeletionInput) {
    const user = await this.prisma.user.findUnique({ where: { id: input.userId } });
    if (!user) {
      throw new NotFoundException(this.i18n.tFor('users.not_found', input.language ?? 'en'));
    }

    if (user.legalHold) {
      await this.recordAudit({
        userId: user.id,
        action: DELETION_AUDIT_ACTIONS.LEGAL_HOLD_BLOCKED,
        actorId: input.actorId ?? user.id,
        reason: input.reason ?? undefined,
        metadata: { retentionDays: input.retentionDays },
      });
      throw new BadRequestException(
        this.i18n.tFor('users.self_deletion_blocked_by_legal_hold', input.language ?? 'en'),
      );
    }

    if (user.isDeactivated && user.scheduledDeletionAt) {
      throw new BadRequestException(
        this.i18n.tFor('users.self_deletion_already_requested', input.language ?? 'en'),
      );
    }

    const retentionDays = this.resolveRetentionDays(input.retentionDays);
    const scheduledDeletionAt = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000);

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        isDeactivated: true,
        deactivatedAt: new Date(),
        scheduledDeletionAt,
        deletionReason: input.reason ?? null,
      },
    });

    await this.recordAudit({
      userId: user.id,
      action: DELETION_AUDIT_ACTIONS.REQUESTED,
      actorId: input.actorId ?? user.id,
      reason: input.reason ?? undefined,
      metadata: {
        retentionDays,
        scheduledDeletionAt: scheduledDeletionAt.toISOString(),
      },
    });

    await this.sendRetentionNoticeEmail(updated, retentionDays, input.language ?? 'en');

    return {
      userId: user.id,
      scheduledDeletionAt,
      retentionDays,
      isDeactivated: true,
    };
  }

  /**
   * Cancel a previously requested deletion. Allowed only when
   * `scheduledDeletionAt` has not yet passed.
   */
  async cancelDeletion(input: CancelAccountDeletionInput) {
    const user = await this.prisma.user.findUnique({ where: { id: input.userId } });
    if (!user) {
      throw new NotFoundException(this.i18n.tFor('users.not_found', input.language ?? 'en'));
    }

    if (!user.isDeactivated || !user.scheduledDeletionAt) {
      throw new BadRequestException(
        this.i18n.tFor('users.self_deletion_not_requested', input.language ?? 'en'),
      );
    }

    if (user.scheduledDeletionAt.getTime() <= Date.now()) {
      throw new BadRequestException(
        this.i18n.tFor('users.self_deletion_already_permanent', input.language ?? 'en'),
      );
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        isDeactivated: false,
        deactivatedAt: null,
        scheduledDeletionAt: null,
        deletionReason: null,
      },
    });

    await this.recordAudit({
      userId: user.id,
      action: DELETION_AUDIT_ACTIONS.CANCELLED,
      actorId: input.actorId ?? user.id,
      metadata: {
        previousScheduledDeletionAt: user.scheduledDeletionAt.toISOString(),
      },
    });

    await this.sendCancellationEmail(updated, input.language ?? 'en');

    return {
      userId: updated.id,
      isDeactivated: false,
      scheduledDeletionAt: null,
    };
  }

  /**
   * Hard-delete any user whose `scheduledDeletionAt` has elapsed AND
   * who is not currently on legal hold. Invoked by the daily cron in
   * `ScheduledDeletionService`.
   */
  async performScheduledDeletion(now: Date = new Date()): Promise<DeletionJobResult> {
    const candidates = await this.prisma.user.findMany({
      where: {
        isDeactivated: true,
        scheduledDeletionAt: { lte: now },
      },
      select: { id: true, email: true, legalHold: true },
    });

    let deletedCount = 0;
    let blockedByLegalHold = 0;

    for (const candidate of candidates) {
      if (candidate.legalHold) {
        blockedByLegalHold += 1;
        await this.recordAudit({
          userId: candidate.id,
          action: DELETION_AUDIT_ACTIONS.LEGAL_HOLD_BLOCKED,
          actorId: 'system-cron',
          reason: 'Scheduled deletion blocked by legal hold',
        });
        continue;
      }

      try {
        await this.prisma.user.delete({ where: { id: candidate.id } });
        await this.recordAudit({
          userId: candidate.id,
          action: DELETION_AUDIT_ACTIONS.PERFORMED,
          actorId: 'system-cron',
          metadata: { executedAt: now.toISOString() },
        });
        await this.sendCompletionEmail(candidate.email, 'en');
        deletedCount += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to delete user ${candidate.id} (${candidate.email}): ${message}`);
      }
    }

    return { deletedCount, blockedByLegalHold };
  }

  private async sendRetentionNoticeEmail(
    user: { id: string; email: string; firstName?: string | null },
    retentionDays: number,
    language: string,
  ): Promise<void> {
    try {
      await this.emailService.sendEmail({
        to: user.email,
        subject: this.i18n.tFor('users.self_deletion_already_requested', language),
        html: `<p>${this.i18n.tFor('common.unexpected_error', language).slice(0, 0)}</p>
          <p>Hi ${user.firstName ?? 'there'},</p>
          <p>Your account has been scheduled for permanent deletion in <strong>${retentionDays} days</strong>.</p>
          <p>If you change your mind, sign in before that time and cancel the request.</p>`,
        userId: user.id,
        emailType: 'ACCOUNT_DELETION_SCHEDULED',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send retention-notice email: ${message}`);
    }
  }

  private async sendCancellationEmail(
    user: { id: string; email: string; firstName?: string | null },
    language: string,
  ): Promise<void> {
    try {
      await this.emailService.sendEmail({
        to: user.email,
        subject: 'Account deletion cancelled',
        html: `<p>Hi ${user.firstName ?? 'there'},</p>
          <p>${this.i18n.tFor('users.self_deletion_not_requested', language)}</p>`,
        userId: user.id,
        emailType: 'ACCOUNT_DELETION_CANCELLED',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send cancellation email: ${message}`);
    }
  }

  private async sendCompletionEmail(email: string, language: string): Promise<void> {
    try {
      await this.emailService.sendEmail({
        to: email,
        subject: 'Your account has been deleted',
        html: `<p>${this.i18n.tFor('users.self_deletion_already_permanent', language)}</p>`,
        emailType: 'ACCOUNT_DELETION_COMPLETED',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send completion email: ${message}`);
    }
  }

  private async recordAudit(entry: {
    userId: string;
    action: string;
    actorId?: string | null;
    reason?: string | null;
    metadata?: Prisma.InputJsonValue;
  }): Promise<void> {
    try {
      await this.prisma.accountDeletionAudit.create({
        data: {
          userId: entry.userId,
          action: entry.action,
          actorId: entry.actorId ?? null,
          reason: entry.reason ?? null,
          metadata: entry.metadata ?? Prisma.JsonNull,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to write deletion audit entry: ${message}`);
    }
  }
}
