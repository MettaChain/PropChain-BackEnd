// @ts-nocheck

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { NotificationsGateway } from './notifications.gateway';
import { EmailService } from '../email/email.service';
import { SmsService } from './sms.service';
import {
  UserPreferencesService,
  shouldDeliverNotificationFromPrefs,
} from '../users/user-preferences.service';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Transaction, TransactionStatus, User } from '@prisma/client';

/**
 * Schema-default notification preferences for users who have never set
 * their own. Mirrors the Prisma defaults in `prisma/schema.prisma` for
 * UserPreferences (email:true, sms:false, inApp:true, push:false,
 * eventTypes:[], quietHours disabled). Used by handleTransactionUpdate when
 * `user.preferences` is null, avoiding the hidden upsert side-effect that
 * `UserPreferencesService.findByUserId` performs when prefs are missing.
 */
const NOTIFICATION_PREFERENCES_DEFAULTS = {
  emailNotifications: true,
  smsNotifications: false,
  inAppNotifications: true,
  pushNotifications: false,
  notificationEventTypes: [] as string[],
  quietHoursEnabled: false,
  quietHoursStart: null as string | null,
  quietHoursEnd: null as string | null,
  timezone: 'UTC',
  perEventSettings: null as Record<string, any> | null,
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private gateway: NotificationsGateway,
    private emailService: EmailService,
    private smsService: SmsService,
    private userPreferencesService: UserPreferencesService,
  ) {}

  async handleTransactionUpdate(transactionId: string) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        buyer: { include: { preferences: true } },
        seller: { include: { preferences: true } },
        property: true,
      },
    });

    if (!transaction) return;

    const parties = [
      { user: transaction.buyer, role: 'Buyer' },
      { user: transaction.seller, role: 'Seller' },
    ];

    await Promise.all(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      parties.map(async ({ user, role }) => {
        const title = `Transaction ${transaction.status}`;
        const message = `Your transaction for property "${transaction.property.title}" has been updated to ${transaction.status}.`;

        // #765 — use the already-included user.preferences to avoid 3 redundant
        // DB roundtrips per party. If a user has no preferences row, fall back
        // to schema defaults locally instead of triggering the upsert
        // side-effect in `UserPreferencesService.findByUserId`.
        const prefs = user.preferences ?? NOTIFICATION_PREFERENCES_DEFAULTS;
        const canInApp = shouldDeliverNotificationFromPrefs(prefs, 'TRANSACTION_UPDATE', 'inApp');
        const canEmail = shouldDeliverNotificationFromPrefs(prefs, 'TRANSACTION_UPDATE', 'email');
        const canSms = shouldDeliverNotificationFromPrefs(prefs, 'TRANSACTION_UPDATE', 'sms');

        await Promise.all([
          canInApp
            ? this.sendNotification(user.id, title, message, 'TRANSACTION_UPDATE', {
                transactionId: transaction.id,
                status: transaction.status,
              })
            : Promise.resolve(),
          canEmail
            ? this.emailService.sendTransactionStatusEmail(user.email, transaction.status, {
                transactionId: transaction.id,
                propertyTitle: transaction.property.title,
                propertyAddress: `${transaction.property.address}, ${transaction.property.city}, ${transaction.property.state} ${transaction.property.zipCode}`,
                buyerName: transaction.buyer.firstName
                  ? `${transaction.buyer.firstName} ${transaction.buyer.lastName || ''}`
                  : transaction.buyer.email,
                sellerName: transaction.seller.firstName
                  ? `${transaction.seller.firstName} ${transaction.seller.lastName || ''}`
                  : transaction.seller.email,
                amount: `$${Number(transaction.amount || 0).toLocaleString()}`,
                completionDate:
                  transaction.status === 'COMPLETED' ? new Date().toLocaleDateString() : undefined,
                blockchainTxHash: transaction.blockchainTxHash || undefined,
                cancellationReason: transaction.cancellationReason || undefined,
                cancelledDate:
                  transaction.status === 'CANCELLED' ? new Date().toLocaleDateString() : undefined,
              })
            : Promise.resolve(),
          canSms && user.phone ? this.smsService.sendSms(user.phone, message) : Promise.resolve(),
        ]);
      }),
    );
  }

  async sendNotification(
    userId: string,
    title: string,
    message: string,
    type: string,
    metadata?: any,
  ) {
    // 1. Save to database
    const notification = await this.prisma.notification.create({
      data: {
        userId,
        title,
        message,
        type,
        metadata: metadata || {},
      },
    });

    // 2. Try real-time delivery
    // FCM Push Integration
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { fcmToken: true },
    });
    if (user?.fcmToken) {
      this.logger.log(`Sending FCM notification to token: ${user.fcmToken}`);
      // In production, use admin.messaging().send() here
    }
    const delivered = this.gateway.sendToUser(userId, 'notification', notification);

    if (delivered) {
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: { status: 'DELIVERED' },
      });
    }

    return notification;
  }

  async getUserNotifications(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async markAsRead(id: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });

    if (!notification || notification.userId !== userId) {
      throw new Error('Notification not found or unauthorized');
    }

    return this.prisma.notification.update({
      where: { id },
      data: { status: 'READ', readAt: new Date() },
    });
  }

  async markAllAsRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, status: { not: 'READ' } },
      data: { status: 'READ', readAt: new Date() },
    });
  }

  async getUnreadCount(userId: string) {
    return this.prisma.notification.count({
      where: { userId, status: { not: 'READ' } },
    });
  }

  async deleteNotification(id: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });

    if (!notification || notification.userId !== userId) {
      throw new Error('Notification not found or unauthorized');
    }

    return this.prisma.notification.delete({
      where: { id },
    });
  }

  async deliverPending(userId: string) {
    // Issue #911 – Replace the N+1 loop (one UPDATE per notification) with a
    // single batch UPDATE after collecting the IDs that were delivered.
    const pending = await this.prisma.notification.findMany({
      where: { userId, status: 'PENDING' },
    });

    const deliveredIds: string[] = [];
    for (const notification of pending) {
      const delivered = this.gateway.sendToUser(userId, 'notification', notification);
      if (delivered) {
        deliveredIds.push(notification.id);
      }
    }

    if (deliveredIds.length > 0) {
      // Single batch update instead of one UPDATE per notification
      await this.prisma.notification.updateMany({
        where: { id: { in: deliveredIds } },
        data: { status: 'DELIVERED' },
      });
    }
  }

  async scheduleNotification(
    userId: string,
    title: string,
    message: string,
    type: string,
    scheduleData: { scheduledAt: Date; isRecurring?: boolean; cron?: string; timezone?: string },
  ) {
    return this.prisma.notification.create({
      data: {
        userId,
        title,
        message,
        type,
        status: 'PENDING',
        ...scheduleData,
      },
    });
  }

  async cancelScheduledNotification(id: string) {
    return this.prisma.notification.deleteMany({
      where: {
        id,
        status: 'PENDING',
        scheduledAt: { not: null },
      },
    });
  }
}
