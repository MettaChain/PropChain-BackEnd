import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateWebhookDto, UpdateWebhookDto } from './webhook.dto';
import { WebhookEventType, WebhookDeliveryStatus } from '@prisma/client';
import * as crypto from 'crypto';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  private readonly MAX_ATTEMPTS = 3;
  private readonly RETRY_DELAYS = [60, 300, 900];

  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateWebhookDto) {
    const secret = crypto.randomBytes(32).toString('hex');
    return this.prisma.webhook.create({
      data: {
        userId,
        url: dto.url,
        secret,
        eventTypes: dto.eventTypes as WebhookEventType[],
        description: dto.description,
      },
      select: {
        id: true,
        url: true,
        eventTypes: true,
        description: true,
        isActive: true,
        secret: true,
        createdAt: true,
      },
    });
  }

  async findAll(userId: string) {
    return this.prisma.webhook.findMany({
      where: { userId },
      select: {
        id: true,
        url: true,
        eventTypes: true,
        description: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async findOne(id: string, userId: string) {
    const webhook = await this.prisma.webhook.findFirst({
      where: { id, userId },
      select: {
        id: true,
        url: true,
        eventTypes: true,
        description: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!webhook) throw new NotFoundException('Webhook not found');
    return webhook;
  }

  async update(id: string, userId: string, dto: UpdateWebhookDto) {
    await this.findOne(id, userId);
    return this.prisma.webhook.update({
      where: { id },
      data: {
        ...(dto.url && { url: dto.url }),
        ...(dto.eventTypes && {
          eventTypes: dto.eventTypes as WebhookEventType[],
        }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.description !== undefined && { description: dto.description }),
      },
      select: {
        id: true,
        url: true,
        eventTypes: true,
        description: true,
        isActive: true,
        updatedAt: true,
      },
    });
  }

  async remove(id: string, userId: string) {
    await this.findOne(id, userId);
    await this.prisma.webhook.delete({ where: { id } });
    return { message: 'Webhook deleted successfully' };
  }

  async trigger(eventType: WebhookEventType, payload: object) {
    const webhooks = await this.prisma.webhook.findMany({
      where: {
        isActive: true,
        eventTypes: { has: eventType },
      },
    });

    for (const webhook of webhooks) {
      const delivery = await this.prisma.webhookDelivery.create({
        data: {
          webhookId: webhook.id,
          eventType,
          payload,
          status: WebhookDeliveryStatus.PENDING,
        },
      });
      await this.deliver(webhook, delivery.id, payload);
    }
  }

  private async deliver(webhook: any, deliveryId: string, payload: object) {
    const body = JSON.stringify(payload);
    const signature = this.sign(body, webhook.secret);

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-PropChain-Signature': signature,
          'X-PropChain-Event': (payload as any)['event'] ?? 'webhook',
        },
        signal: AbortSignal.timeout(10_000),
        body,
      });

      const responseBody = await response.text().catch(() => '');

      await this.prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: response.ok
            ? WebhookDeliveryStatus.SUCCESS
            : WebhookDeliveryStatus.FAILED,
          attempts: { increment: 1 },
          responseStatus: response.status,
          responseBody: responseBody.slice(0, 1000),
          deliveredAt: response.ok ? new Date() : null,
          nextRetryAt: !response.ok ? this.nextRetry(1) : null,
        },
      });
    } catch (err) {
      await this.prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: WebhookDeliveryStatus.FAILED,
          attempts: { increment: 1 },
          errorMessage: err.message,
          nextRetryAt: this.nextRetry(1),
        },
      });
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async retryFailedDeliveries() {
    const due = await this.prisma.webhookDelivery.findMany({
      where: {
        status: WebhookDeliveryStatus.FAILED,
        attempts: { lt: this.MAX_ATTEMPTS },
        nextRetryAt: { lte: new Date() },
      },
      include: { webhook: true },
    });

    for (const delivery of due) {
      await this.prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: { status: WebhookDeliveryStatus.RETRYING },
      });
      await this.deliver(delivery.webhook, delivery.id, delivery.payload as object);
    }
  }

  async getDeliveries(webhookId: string, userId: string) {
    await this.findOne(webhookId, userId);
    return this.prisma.webhookDelivery.findMany({
      where: { webhookId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        eventType: true,
        status: true,
        attempts: true,
        responseStatus: true,
        errorMessage: true,
        deliveredAt: true,
        nextRetryAt: true,
        createdAt: true,
      },
    });
  }

  private sign(body: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(body).digest('hex');
  }

  private nextRetry(attempt: number): Date {
    const delaySecs = this.RETRY_DELAYS[attempt - 1] ?? 900;
    return new Date(Date.now() + delaySecs * 1000);
  }
}