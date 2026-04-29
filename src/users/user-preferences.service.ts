import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  CreateUserPreferencesDto,
  UpdateUserPreferencesDto,
  UpdateNotificationPreferencesDto,
} from './dto/user-preferences.dto';

@Injectable()
export class UserPreferencesService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, data: CreateUserPreferencesDto) {
    const existing = await this.prisma.userPreferences.findUnique({
      where: { userId },
    });

    if (existing) {
      return this.update(userId, data);
    }

    return this.prisma.userPreferences.create({
      data: {
        userId,
        ...data,
      },
    });
  }

  async findByUserId(userId: string) {
    const preferences = await this.prisma.userPreferences.findUnique({
      where: { userId },
    });

    if (!preferences) {
      return this.create(userId, {});
    }

    return preferences;
  }

  async update(userId: string, data: UpdateUserPreferencesDto) {
    return this.prisma.userPreferences.update({
      where: { userId },
      data,
    });
  }

  async remove(userId: string) {
    return this.prisma.userPreferences.delete({
      where: { userId },
    });
  }

  // ─── Notification Preferences (#370) ──────────────────────────────────────

  /**
   * Returns only the notification-related preference fields for the user.
   */
  async getNotificationPreferences(userId: string) {
    const prefs = await this.findByUserId(userId);

    return {
      channels: {
        email: prefs.emailNotifications,
        sms: prefs.smsNotifications,
        push: prefs.pushNotifications,
        inApp: prefs.inAppNotifications,
      },
      frequency: prefs.notificationFrequency,
      eventTypes: prefs.notificationEventTypes,
      quietHours: {
        enabled: prefs.quietHoursEnabled,
        start: prefs.quietHoursStart ?? null,
        end: prefs.quietHoursEnd ?? null,
      },
      perEventSettings: prefs.perEventSettings ?? {},
    };
  }

  /**
   * Updates only the notification-related preference fields.
   */
  async updateNotificationPreferences(
    userId: string,
    dto: UpdateNotificationPreferencesDto,
  ) {
    // Ensure preferences row exists
    await this.findByUserId(userId);

    const {
      emailNotifications,
      smsNotifications,
      pushNotifications,
      inAppNotifications,
      notificationFrequency,
      notificationEventTypes,
      quietHoursEnabled,
      quietHoursStart,
      quietHoursEnd,
      perEventSettings,
    } = dto;

    const updated = await this.prisma.userPreferences.update({
      where: { userId },
      data: {
        ...(emailNotifications !== undefined && { emailNotifications }),
        ...(smsNotifications !== undefined && { smsNotifications }),
        ...(pushNotifications !== undefined && { pushNotifications }),
        ...(inAppNotifications !== undefined && { inAppNotifications }),
        ...(notificationFrequency !== undefined && { notificationFrequency }),
        ...(notificationEventTypes !== undefined && { notificationEventTypes }),
        ...(quietHoursEnabled !== undefined && { quietHoursEnabled }),
        ...(quietHoursStart !== undefined && { quietHoursStart }),
        ...(quietHoursEnd !== undefined && { quietHoursEnd }),
        ...(perEventSettings !== undefined && { perEventSettings }),
      },
    });

    return {
      channels: {
        email: updated.emailNotifications,
        sms: updated.smsNotifications,
        push: updated.pushNotifications,
        inApp: updated.inAppNotifications,
      },
      frequency: updated.notificationFrequency,
      eventTypes: updated.notificationEventTypes,
      quietHours: {
        enabled: updated.quietHoursEnabled,
        start: updated.quietHoursStart ?? null,
        end: updated.quietHoursEnd ?? null,
      },
      perEventSettings: updated.perEventSettings ?? {},
    };
  }

  /**
   * Checks whether a notification should be delivered to a user right now,
   * respecting quiet hours and event-type subscriptions.
   */
  async shouldDeliverNotification(
    userId: string,
    eventType: string,
    channel: 'email' | 'sms' | 'push' | 'inApp',
  ): Promise<boolean> {
    const prefs = await this.findByUserId(userId);

    // Check if the channel is enabled globally
    const channelMap: Record<string, boolean> = {
      email: prefs.emailNotifications,
      sms: prefs.smsNotifications,
      push: prefs.pushNotifications,
      inApp: prefs.inAppNotifications,
    };
    if (!channelMap[channel]) return false;

    // Check per-event channel override
    const perEvent = (prefs.perEventSettings as Record<string, any> | null) ?? {};
    if (perEvent[eventType] && perEvent[eventType][channel] === false) return false;

    // Check event type subscription (empty array = all events allowed)
    const subscribedTypes: string[] = prefs.notificationEventTypes ?? [];
    if (subscribedTypes.length > 0 && !subscribedTypes.includes(eventType)) return false;

    // Check quiet hours
    if (prefs.quietHoursEnabled && prefs.quietHoursStart && prefs.quietHoursEnd) {
      const tz = prefs.timezone ?? 'UTC';
      const now = new Date();
      const formatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: tz,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      const currentTime = formatter.format(now); // "HH:MM"

      if (isInQuietWindow(currentTime, prefs.quietHoursStart, prefs.quietHoursEnd)) {
        return false;
      }
    }

    return true;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Returns true if `current` falls within [start, end) window,
 * handling overnight ranges (e.g. 22:00 – 08:00).
 */
function isInQuietWindow(current: string, start: string, end: string): boolean {
  const c = timeToMinutes(current);
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);

  if (s <= e) {
    return c >= s && c < e;
  }
  // Overnight window
  return c >= s || c < e;
}
