import {
  IsBoolean,
  IsOptional,
  IsString,
  IsObject,
  IsIn,
  IsArray,
  ArrayUnique,
  Matches,
  ValidateIf,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export const NOTIFICATION_FREQUENCIES = ['INSTANT', 'HOURLY', 'DAILY', 'WEEKLY'] as const;
export type NotificationFrequency = (typeof NOTIFICATION_FREQUENCIES)[number];

export const NOTIFICATION_EVENT_TYPES = [
  'TRANSACTION_UPDATE',
  'PROPERTY_ALERT',
  'MARKET_UPDATE',
  'DISPUTE',
  'SYSTEM',
  'DOCUMENT',
  'PAYMENT',
] as const;
export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateUserPreferencesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  emailNotifications?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  smsNotifications?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  pushNotifications?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  inAppNotifications?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  propertyAlerts?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  marketUpdates?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  perEventSettings?: Record<string, any>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  theme?: string;
}

export class UpdateUserPreferencesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  emailNotifications?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  smsNotifications?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  pushNotifications?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  inAppNotifications?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  propertyAlerts?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  marketUpdates?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  perEventSettings?: Record<string, any>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  theme?: string;
}

// ─── Notification Preferences DTO (#370) ────────────────────────────────────

export class UpdateNotificationPreferencesDto {
  @ApiPropertyOptional({
    description: 'Channel: enable/disable email notifications',
  })
  @IsOptional()
  @IsBoolean()
  emailNotifications?: boolean;

  @ApiPropertyOptional({
    description: 'Channel: enable/disable SMS notifications',
  })
  @IsOptional()
  @IsBoolean()
  smsNotifications?: boolean;

  @ApiPropertyOptional({
    description: 'Channel: enable/disable push notifications',
  })
  @IsOptional()
  @IsBoolean()
  pushNotifications?: boolean;

  @ApiPropertyOptional({
    description: 'Channel: enable/disable in-app notifications',
  })
  @IsOptional()
  @IsBoolean()
  inAppNotifications?: boolean;

  @ApiPropertyOptional({
    enum: NOTIFICATION_FREQUENCIES,
    description: 'How often to batch and deliver notifications',
  })
  @IsOptional()
  @IsIn(NOTIFICATION_FREQUENCIES)
  notificationFrequency?: NotificationFrequency;

  @ApiPropertyOptional({
    isArray: true,
    enum: NOTIFICATION_EVENT_TYPES,
    description: 'Event types the user wants to receive. Empty array = all events.',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(NOTIFICATION_EVENT_TYPES, { each: true })
  notificationEventTypes?: NotificationEventType[];

  @ApiPropertyOptional({
    description: 'Enable quiet hours (no notifications during the specified window)',
  })
  @IsOptional()
  @IsBoolean()
  quietHoursEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Quiet hours start time in HH:MM format (user local timezone)',
    example: '22:00',
  })
  @ValidateIf((o) => o.quietHoursEnabled === true || o.quietHoursStart !== undefined)
  @IsOptional()
  @Matches(TIME_REGEX, { message: 'quietHoursStart must be in HH:MM format' })
  quietHoursStart?: string;

  @ApiPropertyOptional({
    description: 'Quiet hours end time in HH:MM format (user local timezone)',
    example: '08:00',
  })
  @ValidateIf((o) => o.quietHoursEnabled === true || o.quietHoursEnd !== undefined)
  @IsOptional()
  @Matches(TIME_REGEX, { message: 'quietHoursEnd must be in HH:MM format' })
  quietHoursEnd?: string;

  @ApiPropertyOptional({
    description:
      'Per-event channel overrides. Key = event type, value = { email, sms, push, inApp }',
    example: {
      TRANSACTION_UPDATE: { email: true, sms: true, push: false, inApp: true },
      MARKET_UPDATE: { email: false, sms: false, push: false, inApp: true },
    },
  })
  @IsOptional()
  @IsObject()
  perEventSettings?: Record<string, { email?: boolean; sms?: boolean; push?: boolean; inApp?: boolean }>;
}
