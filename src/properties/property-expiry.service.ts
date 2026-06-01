import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PropertiesService } from './properties.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PropertyStatus } from '../types/prisma.types';

@Injectable()
export class PropertyExpiryService {
  private readonly logger = new Logger(PropertyExpiryService.name);

  constructor(
    private readonly propertiesService: PropertiesService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Run daily at 2:00 AM to expire properties that have passed their expiry date
   * and send notifications for properties expiring soon
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async handlePropertyExpiry() {
    this.logger.log('Running property expiry job...');

    try {
      // Send notifications for properties expiring in 7 days
      await this.sendExpiryNotifications();

      // Expire properties that have passed their expiry date
      const result = await this.propertiesService.expireProperties();

      if (result.updatedCount > 0) {
        this.logger.log(`Successfully expired ${result.updatedCount} properties`);
        // Send notifications for expired properties
        await this.sendExpiredNotifications();
      } else {
        this.logger.log('No properties expired at this time');
      }
    } catch (error) {
      this.logger.error('Error during property expiry:', error);
    }
  }

  /**
   * Send notifications for properties expiring in 7 days
   */
  private async sendExpiryNotifications() {
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    const properties = await this.propertiesService.prisma.property.findMany({
      where: {
        expiryDate: {
          equals: sevenDaysFromNow,
        },
        status: {
          notIn: [
            PropertyStatus.SOLD,
            PropertyStatus.RENTED,
            PropertyStatus.ARCHIVED,
            PropertyStatus.EXPIRED,
          ],
        },
      },
      include: {
        owner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    for (const property of properties) {
      const title = `Property Listing Expiring Soon`;
      const message = `Your property "${property.title}" is scheduled to expire in 7 days. Consider renewing it to keep it active.`;

      // Send notification to property owner
      await this.notificationsService.sendNotification(
        property.ownerId,
        title,
        message,
        'PROPERTY_EXPIRY_WARNING',
        {
          propertyId: property.id,
          propertyTitle: property.title,
          expiryDate: property.expiryDate,
        }
      );
    }
  }

  /**
   * Send notifications for properties that have been expired
   */
  private async sendExpiredNotifications() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const properties = await this.propertiesService.prisma.property.findMany({
      where: {
        status: PropertyStatus.EXPIRED,
        updatedAt: {
          gte: yesterday,
        },
      },
      include: {
        owner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    for (const property of properties) {
      const title = `Property Listing Expired`;
      const message = `Your property "${property.title}" has expired due to reaching its expiry date. You can renew it to make it active again.`;

      // Send notification to property owner
      await this.notificationsService.sendNotification(
        property.ownerId,
        title,
        message,
        'PROPERTY_EXPIRED',
        {
          propertyId: property.id,
          propertyTitle: property.title,
          expiryDate: property.expiryDate,
        }
      );
    }
  }

  /**
   * Manual trigger for testing or immediate expiry
   */
  async triggerManualExpiry() {
    this.logger.log('Manual property expiry triggered');
    return this.propertiesService.expireProperties();
  }
}