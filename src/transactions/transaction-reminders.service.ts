import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class TransactionRemindersService {
  private readonly logger = new Logger(TransactionRemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async sendDeadlineReminders(daysAhead: number = 3): Promise<{ sent: number }> {
    const now = new Date();
    const cutoff = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

    const milestones = await this.prisma.transactionMilestone.findMany({
      where: {
        status: 'PENDING' as any,
        expectedDate: { gte: now, lte: cutoff },
        reminderSentAt: null,
      } as any,
      include: {
        transaction: {
          select: { buyerId: true, sellerId: true },
        },
      },
    });

    let sent = 0;
    for (const milestone of milestones) {
      const tx = (milestone as any).transaction;

      const optOutBuyer = await this.getUserOptOut(tx.buyerId);
      const optOutSeller = await this.getUserOptOut(tx.sellerId);

      if (!optOutBuyer) {
        await this.notificationsService.sendNotification(
          tx.buyerId,
          'Transaction Deadline Reminder',
          `Reminder: "${milestone.title}" is due on ${milestone.expectedDate.toDateString()}`,
          'TRANSACTION_UPDATE',
          { milestoneId: milestone.id },
        );
        sent++;
      }

      if (tx.sellerId !== tx.buyerId && !optOutSeller) {
        await this.notificationsService.sendNotification(
          tx.sellerId,
          'Transaction Deadline Reminder',
          `Reminder: "${milestone.title}" is due on ${milestone.expectedDate.toDateString()}`,
          'TRANSACTION_UPDATE',
          { milestoneId: milestone.id },
        );
        sent++;
      }

      await (this.prisma as any).transactionMilestone.update({
        where: { id: milestone.id },
        data: { reminderSentAt: new Date() },
      });

      this.logger.log(`Sent reminder for milestone ${milestone.id}`);
    }

    return { sent };
  }

  private async getUserOptOut(userId: string): Promise<boolean> {
    const prefs = await this.prisma.userPreferences.findUnique({ where: { userId } });
    return (prefs as any)?.optOutReminders ?? false;
  }
}
