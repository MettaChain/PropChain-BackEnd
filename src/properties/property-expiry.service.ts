// @ts-nocheck

import { Injectable, Logger, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PropertiesService } from './properties.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PropertyStatus } from '../types/prisma.types';

const EXPIRY_WARNING_DAYS = [7, 3, 1];
const GRACE_PERIOD_DAYS = 30;

@Injectable()
export class PropertyExpiryService {
  private readonly logger = new Logger(PropertyExpiryService.name);

  constructor(
    private readonly propertiesService: PropertiesService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async handlePropertyExpiry() {
    this.logger.log('Running property expiry job...');

    try {
      await this.sendExpiryWarningNotifications();

      const result = await this.propertiesService.expireProperties();

      if (result.updatedCount > 0) {
        this.logger.log(`Successfully expired ${result.updatedCount} properties`);
        await this.sendExpiredNotifications();
      } else {
        this.logger.log('No properties expired at this time');
      }

      await this.archiveExpiredPropertiesPastGracePeriod();
    } catch (error) {
      this.logger.error('Error during property expiry:', error);
    }
  }

  private async sendExpiryWarningNotifications() {
    for (const days of EXPIRY_WARNING_DAYS) {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + days);
      targetDate.setHours(0, 0, 0, 0);

      const nextDay = new Date(targetDate);
      nextDay.setDate(nextDay.getDate() + 1);

      const properties = await this.propertiesService.prisma.property.findMany({
        where: {
          expiryDate: {
            gte: targetDate,
            lt: nextDay,
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

      await Promise.all(
        properties.map((property) => {
          const title = `Property Listing Expiring Soon`;
          const message = `Your property "${property.title}" is scheduled to expire in ${days} day${days > 1 ? 's' : ''}. Consider renewing it to keep it active.`;

          return this.notificationsService.sendNotification(
            property.ownerId,
            title,
            message,
            'PROPERTY_EXPIRY_WARNING',
            {
              propertyId: property.id,
              propertyTitle: property.title,
              expiryDate: property.expiryDate,
              daysUntilExpiry: days,
            },
          );
        }),
      );

      if (properties.length > 0) {
        this.logger.log(`Sent ${properties.length} expiry warnings for ${days}-day threshold`);
      }
    }
  }

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

    await Promise.all(
      properties.map((property) => {
        const title = `Property Listing Expired`;
        const message = `Your property "${property.title}" has expired due to reaching its expiry date. You can renew it to make it active again.`;

        return this.notificationsService.sendNotification(
          property.ownerId,
          title,
          message,
          'PROPERTY_EXPIRED',
          {
            propertyId: property.id,
            propertyTitle: property.title,
            expiryDate: property.expiryDate,
          },
        );
      }),
    );
  }

  private async archiveExpiredPropertiesPastGracePeriod() {
    const graceCutoff = new Date();
    graceCutoff.setDate(graceCutoff.getDate() - GRACE_PERIOD_DAYS);

    const result = await this.propertiesService.prisma.property.updateMany({
      where: {
        status: PropertyStatus.EXPIRED,
        updatedAt: {
          lt: graceCutoff,
        },
      },
      data: {
        status: PropertyStatus.ARCHIVED,
      },
    });

    if (result.count > 0) {
      this.logger.log(`Archived ${result.count} properties past ${GRACE_PERIOD_DAYS}-day grace period`);

      const archivedProps = await this.propertiesService.prisma.property.findMany({
        where: {
          status: PropertyStatus.ARCHIVED,
          updatedAt: {
            lt: graceCutoff,
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

      await Promise.all(
        archivedProps.map((property) => {
          const title = `Property Listing Archived`;
          const message = `Your property "${property.title}" has been archived after the ${GRACE_PERIOD_DAYS}-day grace period following expiry.`;

          return this.notificationsService.sendNotification(
            property.ownerId,
            title,
            message,
            'PROPERTY_ARCHIVED',
            {
              propertyId: property.id,
              propertyTitle: property.title,
              expiryDate: property.expiryDate,
            },
          );
        }),
      );
    }
  }

  async renewProperty(id: string, userId: string, days: number) {
    const property = await this.propertiesService.prisma.property.findUnique({
      where: { id },
    });

    if (!property) {
      throw new NotFoundException(`Property with ID ${id} not found`);
    }

    if (property.ownerId !== userId) {
      throw new ForbiddenException('You can only renew your own properties');
    }

    const newExpiryDate = new Date();
    newExpiryDate.setDate(newExpiryDate.getDate() + days);

    const updated = await this.propertiesService.prisma.property.update({
      where: { id },
      data: {
        expiryDate: newExpiryDate,
        status: PropertyStatus.ACTIVE,
      },
    });

    this.logger.log(`Property ${id} renewed for ${days} days. New expiry: ${newExpiryDate.toISOString()}`);

    return {
      property: updated,
      newExpiryDate,
      renewedDays: days,
    };
  }

  async triggerManualExpiry() {
    this.logger.log('Manual property expiry triggered');
    return this.propertiesService.expireProperties();
  }
}
