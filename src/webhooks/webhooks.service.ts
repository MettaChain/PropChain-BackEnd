import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateWebhookDto, UpdateWebhookDto } from './webhook.dto';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as crypto from 'crypto';
import { validateWebhookUrl } from './url-validator.util';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  private readonly MAX_ATTEMPTS = 5;
  private readonly RETRY_DELAYS_MS = [1000, 5000, 15000, 60000, 300000]; // 1s, 5s, 15s, 60s, 300s

  private readonly TRIGGER_RATE_LIMIT_WINDOW_MS = 60_000;
  private readonly TRIGGER_RATE_LIMIT_MAX = parseInt(
    process.env.WEBHOOK_TRIGGER_RATE_LIMIT ?? '60',
    10,
  );

  /**
   * Warn (rather than reject) when an event payload exceeds this many bytes so
   * operators can spot oversized deliveries without dropping legitimate data.
   */
  private readonly MAX_PAYLOAD_BYTES = parseInt(
    process.env.WEBHOOK_MAX_PAYLOAD_BYTES ?? '65536',
    10,
  );

  /** Default retention for delivery logs, overridable via env (issue #1295). */
  private readonly DEFAULT_DELIVERY_LOG_RETENTION_DAYS = parseInt(
    process.env.CLEANUP_WEBHOOK_LOG_DAYS ?? '30',
    10,
  );

  private readonly webhookTriggerTimestamps = new Map<string, number[]>();

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @InjectQueue('webhook-delivery') private readonly webhookQueue?: Queue,
  ) {}

  /**
   * Rate-limits trigger frequency per webhook (sliding 1-minute window).
   */
  isRateLimited(webhookId: string): boolean {
    const now = Date.now();
    const windowStart = now - this.TRIGGER_RATE_LIMIT_WINDOW_MS;
    const timestamps = (this.webhookTriggerTimestamps.get(webhookId) ?? []).filter(
      (t) => t > windowStart,
    );
    if (timestamps.length >= this.TRIGGER_RATE_LIMIT_MAX) {
      return true;
    }
    timestamps.push(now);
    this.webhookTriggerTimestamps.set(webhookId, timestamps);
    return false;
  }

  /**
   * Emit a size warning when a payload is larger than the configured cap.
   * Returns true when the payload was flagged.
   */
  warnIfPayloadTooLarge(eventType: string, webhookId: string, payload: object): boolean {
    let size = 0;
    try {
      size = Buffer.byteLength(JSON.stringify(payload) ?? '', 'utf8');
    } catch {
      return false;
    }

    if (size > this.MAX_PAYLOAD_BYTES) {
      this.logger.warn(
        `Webhook ${webhookId} received oversized "${eventType}" payload (${size} bytes > ${this.MAX_PAYLOAD_BYTES} byte cap)`,
      );
      return true;
    }
    return false;
  }

  async create(userId: string, dto: CreateWebhookDto) {
    await validateWebhookUrl(dto.url);
    const secret = crypto.randomBytes(32).toString('hex');
    const webhook = await this.prisma.webhook.create({
      data: {
        userId,
        url: dto.url,
        secret,
        events: dto.eventTypes,
        description: dto.description,
      },
    });
    return { ...webhook, secret };
  }

  async findAll(userId: string) {
    return this.prisma.webhook.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, userId: string) {
    const webhook = await this.prisma.webhook.findFirst({
      where: { id, userId },
    });
    if (!webhook) throw new NotFoundException('Webhook not found');
    return webhook;
  }

  async update(id: string, userId: string, dto: UpdateWebhookDto) {
    await this.findOne(id, userId);
    if (dto.url) {
      await validateWebhookUrl(dto.url);
    }
    return this.prisma.webhook.update({
      where: { id },
      data: {
        ...(dto.url && { url: dto.url }),
        ...(dto.eventTypes && { events: dto.eventTypes }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.isActive !== undefined && {
          status: dto.isActive ? 'ACTIVE' : 'INACTIVE',
        }),
      },
    });
  }

  async rotateSecret(id: string, userId: string) {
    const webhook = await this.findOne(id, userId);
    const newSecret = crypto.randomBytes(32).toString('hex');
    const updated = await this.prisma.webhook.update({
      where: { id: webhook.id },
      data: { secret: newSecret },
    });

    // Issue #1255 – Record secret rotation in audit log
    await this.prisma.activityLog
      .create({
        data: {
          userId,
          action: 'WEBHOOK_SECRET_ROTATED',
          entityType: 'WEBHOOK',
          entityId: id,
          description: `Rotated secret for webhook ${id}`,
          metadata: { webhookId: id, rotatedAt: new Date().toISOString() },
        },
      })
      .catch((err) => {
        this.logger.warn(
          `Failed to audit webhook secret rotation: ${err instanceof Error ? err.message : String(err)}`,
        );
      });

    return { ...updated, secret: newSecret };
  }

  async remove(id: string, userId: string) {
    await this.findOne(id, userId);
    await this.prisma.webhook.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * Dispatches deliveries asynchronously to the BullMQ pipeline (or background
   * task queue) so the caller returns immediately without being blocked by
   * delivery latency.
   */
  async trigger(eventType: string, payload: object): Promise<void> {
    const webhooks = await this.prisma.webhook.findMany({
      where: {
        status: 'ACTIVE',
        events: { has: eventType },
      },
    });

    for (const webhook of webhooks) {
      if (this.isRateLimited(webhook.id)) {
        this.logger.warn(
          `Webhook ${webhook.id} trigger rate limited (exceeded ${this.TRIGGER_RATE_LIMIT_MAX}/min)`,
        );
        continue;
      }

      this.warnIfPayloadTooLarge(eventType, webhook.id, payload);

      if (this.webhookQueue) {
        const delivery = await this.prisma.webhookDeliveryLog.create({
          data: {
            webhookId: webhook.id,
            eventType,
            payload,
            status: 'PENDING',
            maxAttempts: this.MAX_ATTEMPTS,
          },
        });

        await this.webhookQueue.add(
          'deliver-webhook',
          {
            deliveryId: delivery.id,
            webhookId: webhook.id,
            eventType,
            payload,
          },
          {
            attempts: this.MAX_ATTEMPTS,
            backoff: {
              type: 'exponential',
              delay: 1000,
            },
            removeOnComplete: true,
          },
        );
      } else {
        // Fallback asynchronous dispatch: caller returns immediately
        setImmediate(() => {
          this.deliverWebhook(webhook, eventType, payload).catch((err) => {
            this.logger.error(
              `Asynchronous webhook delivery failed: ${err instanceof Error ? err.message : String(err)}`,
            );
          });
        });
      }
    }
  }

  /**
   * Worker handler called by WebhookDeliveryProcessor.
   */
  async processDeliveryJob(
    deliveryId: string | undefined,
    webhookId: string,
    eventType: string,
    payload: object,
  ): Promise<void> {
    const webhook = await this.prisma.webhook.findUnique({ where: { id: webhookId } });
    if (!webhook || webhook.status !== 'ACTIVE') {
      return;
    }
    await this.deliverWebhook(webhook, eventType, payload, deliveryId);
  }

  async verifyChallenge(webhookId: string, userId: string, challenge: string) {
    const webhook = await this.findOne(webhookId, userId);
    await validateWebhookUrl(webhook.url);
    try {
      const url = new URL(webhook.url);
      url.searchParams.set('challenge', challenge);
      const response = await fetch(url.toString(), {
        method: 'GET',
        signal: AbortSignal.timeout(10000),
      });
      const body = await response.json();
      if (body.challenge === challenge) {
        await this.prisma.webhook.update({
          where: { id: webhookId },
          data: { status: 'ACTIVE' },
        });
        return { verified: true };
      }
    } catch (error) {
      this.logger.warn(
        `Webhook verification failed for ${webhookId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return { verified: false };
  }

  async getDeliveries(webhookId: string, userId: string) {
    await this.findOne(webhookId, userId);
    return this.prisma.webhookDeliveryLog.findMany({
      where: { webhookId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  /**
   * Re-send a previously stored event payload (issue #1295).
   *
   * The original delivery is kept untouched and a new delivery log row is
   * created for the replay. Because the payload is unchanged, the idempotency
   * key sent to the subscriber (`X-Webhook-Idempotency-Key`) is identical to
   * the original delivery, letting receivers de-duplicate re-sends.
   */
  async replay(webhookId: string, userId: string, deliveryId: string) {
    const webhook = await this.findOne(webhookId, userId);

    const delivery = await this.prisma.webhookDeliveryLog.findFirst({
      where: { id: deliveryId, webhookId },
    });

    if (!delivery) {
      throw new NotFoundException('Webhook delivery not found');
    }

    if (webhook.status !== 'ACTIVE') {
      throw new BadRequestException('Cannot replay a delivery for an inactive webhook');
    }

    this.warnIfPayloadTooLarge(delivery.eventType, webhook.id, delivery.payload as object);

    if (this.webhookQueue) {
      const replayLog = await this.prisma.webhookDeliveryLog.create({
        data: {
          webhookId: webhook.id,
          eventType: delivery.eventType,
          payload: delivery.payload as object,
          status: 'PENDING',
          maxAttempts: this.MAX_ATTEMPTS,
        },
      });

      await this.webhookQueue.add(
        'deliver-webhook',
        {
          deliveryId: replayLog.id,
          webhookId: webhook.id,
          eventType: delivery.eventType,
          payload: delivery.payload,
        },
        { attempts: this.MAX_ATTEMPTS, removeOnComplete: true },
      );

      return {
        replayed: true,
        sourceDeliveryId: delivery.id,
        deliveryId: replayLog.id,
        eventType: delivery.eventType,
      };
    }

    await this.deliverWebhook(webhook, delivery.eventType, delivery.payload as object);

    return {
      replayed: true,
      sourceDeliveryId: delivery.id,
      eventType: delivery.eventType,
    };
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async retryFailedDeliveries() {
    const now = new Date();
    const pendingRetries = await this.prisma.webhookDeliveryLog.findMany({
      where: {
        status: 'RETRYING',
        nextRetryAt: { lte: now },
        attempts: { lt: this.MAX_ATTEMPTS },
      },
      include: { webhook: true },
    });

    for (const delivery of pendingRetries) {
      if (!delivery.webhook || delivery.webhook.status !== 'ACTIVE') continue;

      if (this.webhookQueue) {
        await this.webhookQueue.add('deliver-webhook', {
          deliveryId: delivery.id,
          webhookId: delivery.webhook.id,
          eventType: delivery.eventType,
          payload: delivery.payload as object,
        });
      } else {
        setImmediate(() => {
          this.deliverWebhook(
            delivery.webhook,
            delivery.eventType,
            delivery.payload as object,
            delivery.id,
          ).catch((err) => {
            this.logger.error(
              `Cron webhook retry failed: ${err instanceof Error ? err.message : String(err)}`,
            );
          });
        });
      }
    }
  }

  /**
   * Prune old WebhookDeliveryLog rows older than retentionDays.
   *
   * Retention defaults to `CLEANUP_WEBHOOK_LOG_DAYS` (issue #1295) so pruning
   * can be tuned alongside the rest of the CleanupService retention windows.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async pruneOldDeliveryLogs(retentionDays = this.DEFAULT_DELIVERY_LOG_RETENTION_DAYS) {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const result = await this.prisma.webhookDeliveryLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    this.logger.log(
      `Pruned ${result.count} webhook delivery log(s) older than ${retentionDays} days`,
    );
    return result;
  }

  /**
   * Helper to compute retry delay using 0-based mapping (Issue #1256).
   */
  getRetryDelay(nextAttempt: number): number {
    const delayIndex = Math.min(Math.max(0, nextAttempt - 1), this.RETRY_DELAYS_MS.length - 1);
    return this.RETRY_DELAYS_MS[delayIndex];
  }

  async deliverWebhook(
    webhook: any,
    eventType: string,
    payload: object,
    existingDeliveryId?: string,
  ): Promise<void> {
    let delivery: any;

    if (existingDeliveryId) {
      delivery = await this.prisma.webhookDeliveryLog.findUnique({
        where: { id: existingDeliveryId },
      });
    }

    if (!delivery) {
      delivery = await this.prisma.webhookDeliveryLog.create({
        data: {
          webhookId: webhook.id,
          eventType,
          payload,
          status: 'PENDING',
          maxAttempts: this.MAX_ATTEMPTS,
        },
      });
    }

    // SSRF verification before network request
    try {
      await validateWebhookUrl(webhook.url);
    } catch (ssrfError: any) {
      const errorMessage = ssrfError instanceof Error ? ssrfError.message : String(ssrfError);
      await this.prisma.webhookDeliveryLog.update({
        where: { id: delivery.id },
        data: {
          status: 'FAILED',
          error: `Blocked by SSRF validation: ${errorMessage}`,
          attempts: delivery.attempts + 1,
        },
      });
      return;
    }

    const eventId = (payload as any)?.eventId || (payload as any)?.id || delivery.id;
    const idempotencyKey = (payload as any)?.id
      ? `${webhook.id}:${eventType}:${(payload as any).id}`
      : delivery.id;

    const body = JSON.stringify({
      event: eventType,
      eventId,
      payload,
      timestamp: new Date().toISOString(),
    });
    const signature = this.sign(body, webhook.secret);

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': eventType,
          'X-Webhook-Delivery-Id': delivery.id,
          'X-Webhook-Event-Id': eventId,
          'X-Webhook-Idempotency-Key': idempotencyKey,
        },
        body,
        signal: AbortSignal.timeout(30000),
      });

      const responseText = await response.text().catch(() => '');

      if (response.ok) {
        await this.prisma.webhookDeliveryLog.update({
          where: { id: delivery.id },
          data: {
            status: 'SUCCESS',
            responseCode: response.status,
            responseBody: responseText.substring(0, 2000),
            attempts: delivery.attempts + 1,
            deliveredAt: new Date(),
            nextRetryAt: null,
          },
        });
        this.logger.log(`Webhook delivered: ${eventType} to ${webhook.url}`);
      } else {
        throw new Error(`HTTP ${response.status}: ${responseText.substring(0, 500)}`);
      }
    } catch (error) {
      const nextAttempt = delivery.attempts + 1;
      const shouldRetry = nextAttempt < this.MAX_ATTEMPTS;
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Issue #1256 – 0-based retry backoff delay mapping
      const delayMs = this.getRetryDelay(nextAttempt);

      await this.prisma.webhookDeliveryLog.update({
        where: { id: delivery.id },
        data: {
          status: shouldRetry ? 'RETRYING' : 'FAILED',
          attempts: nextAttempt,
          error: errorMessage,
          responseBody: errorMessage.substring(0, 2000),
          nextRetryAt: shouldRetry ? new Date(Date.now() + delayMs) : null,
        },
      });

      this.logger.warn(
        `Webhook delivery failed: ${eventType} to ${webhook.url} (attempt ${nextAttempt}/${this.MAX_ATTEMPTS})`,
      );

      // When processed via BullMQ job, rethrow retryable failures so BullMQ tracks retries
      if (existingDeliveryId && shouldRetry) {
        throw error;
      }
    }
  }

  sign(body: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(body).digest('hex');
  }
}
