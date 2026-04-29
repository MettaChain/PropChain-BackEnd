import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { NotificationsGateway } from './notifications.gateway';
import { EmailService } from '../email/email.service';
import { SmsService } from './sms.service';
import { UserPreferencesService } from '../users/user-preferences.service';
import { Transaction, TransactionStatus, User } from '@prisma/client';

@Injectable()
export class NotificationsService {
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

    for (const party of parties) {
      const { user, role } = party;
      const preferences = user.preferences;

      const title = `Transaction ${transaction.status}`;
      const message = `Your transaction for property "${transaction.property.title}" has been updated to ${transaction.status}.`;

      // 1. In-App Notification
      const canInApp = await this.userPreferencesService.shouldDeliverNotification(
        user.id, 'TRANSACTION_UPDATE', 'inApp',
      );
      if (canInApp) {
        await this.sendNotification(user.id, title, message, 'TRANSACTION_UPDATE', {
          transactionId: transaction.id,
          status: transaction.status,
        });
      }

      // 2. Email Notification
      const canEmail = await this.userPreferencesService.shouldDeliverNotification(
        user.id, 'TRANSACTION_UPDATE', 'email',
      );
      if (canEmail) {
        await this.emailService.sendEmail({
          to: user.email,
          subject: `[PropChain] ${title}`,
          html: `<p>${message}</p><p>View your dashboard for details.</p>`,
          userId: user.id,
          emailType: 'TRANSACTION_UPDATE',
        });
      }

      // 3. SMS Notification
      const canSms = await this.userPreferencesService.shouldDeliverNotification(
        user.id, 'TRANSACTION_UPDATE', 'sms',
      );
      if (canSms && user.phone) {
        await this.smsService.sendSms(user.phone, message);
      }
    }
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
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { fcmToken: true } });
    if (user?.fcmToken) {
      console.log(Sending FCM notification to token: \);
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
    const pending = await this.prisma.notification.findMany({
      where: { userId, status: 'PENDING' },
    });

    for (const notification of pending) {
      const delivered = this.gateway.sendToUser(userId, 'notification', notification);
      if (delivered) {
        await this.prisma.notification.update({
          where: { id: notification.id },
          data: { status: 'DELIVERED' },
        });
      }
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
