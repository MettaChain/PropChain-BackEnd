// @ts-nocheck

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
  async updateNotificationPreferences(userId: string, dto: UpdateNotificationPreferencesDto) {
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
    return shouldDeliverNotificationFromPrefs(prefs, eventType, channel);
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

/**
 * Pure decision function: given a UserPreferences-shaped object plus an event
 * type and a channel, returns whether a notification should be delivered.
 *
 * Reused by:
 *  - `UserPreferencesService.shouldDeliverNotification(userId, …)` — fetches
 *    prefs via `findByUserId` then delegates here so the logic lives in
 *    exactly one place.
 *  - `NotificationsService.handleTransactionUpdate` — consumes the
 *    already-included `user.preferences` from the parties query, removing
 *    6 redundant `findUnique` roundtrips per transaction update (#765).
 *
 * Takes a structurally-typed object so callers can pass either a real
 * Prisma `UserPreferences` row or schema-default values for users who have
 * never set preferences (no DB write side-effect).
 */
export function shouldDeliverNotificationFromPrefs(
  prefs: {
    emailNotifications: boolean;
    smsNotifications: boolean;
    pushNotifications: boolean;
    inAppNotifications: boolean;
    notificationEventTypes?: string[] | null;
    quietHoursEnabled: boolean;
    quietHoursStart?: string | null;
    quietHoursEnd?: string | null;
    timezone?: string | null;
    perEventSettings?: Record<string, any> | null;
  },
  eventType: string,
  channel: 'email' | 'sms' | 'push' | 'inApp',
): boolean {
  // 1. Channel enabled globally?
  const channelMap: Record<string, boolean> = {
    email: prefs.emailNotifications,
    sms: prefs.smsNotifications,
    push: prefs.pushNotifications,
    inApp: prefs.inAppNotifications,
  };
  if (!channelMap[channel]) return false;

  // 2. Per-event channel override (channel explicitly disabled for this event)
  const perEvent = (prefs.perEventSettings as Record<string, any> | null) ?? {};
  if (perEvent[eventType] && perEvent[eventType][channel] === false) return false;

  // 3. Event-type subscription — empty array means all events are allowed
  const subscribedTypes: string[] = prefs.notificationEventTypes ?? [];
  if (subscribedTypes.length > 0 && !subscribedTypes.includes(eventType)) return false;

  // 4. Quiet hours — only enforced when start, end, and the flag are all set
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
