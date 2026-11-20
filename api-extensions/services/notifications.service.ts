import { Injectable, Logger } from '@nestjs/common';

export interface NotificationPayload {
  event: string;
  recipientId?: string;
  data?: Record<string, unknown>;
}

/**
 * Minimal, self-contained notification sink for api-extensions modules.
 * Intentionally decoupled from `src/notifications` so this folder stays
 * independent of the main codebase's Prisma/email/SMS wiring.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  notify(payload: NotificationPayload): void {
    this.logger.log(`[${payload.event}] ${JSON.stringify(payload.data ?? {})}`);
  }
}
