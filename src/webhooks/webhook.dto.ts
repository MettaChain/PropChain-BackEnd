// @ts-nocheck

import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  IsEmail,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ValidateNested,
} from 'class-validator';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Type } from 'class-transformer';

export enum WebhookEventType {
  PROPERTY_CREATED = 'PROPERTY_CREATED',
  PROPERTY_UPDATED = 'PROPERTY_UPDATED',
  PROPERTY_STATUS_CHANGED = 'PROPERTY_STATUS_CHANGED',
  TRANSACTION_CREATED = 'TRANSACTION_CREATED',
  TRANSACTION_UPDATED = 'TRANSACTION_UPDATED',
  TRANSACTION_COMPLETED = 'TRANSACTION_COMPLETED',
  USER_VERIFIED = 'USER_VERIFIED',
}

export class CreateWebhookDto {
  @IsUrl()
  url: string;

  @IsArray()
  @IsEnum(WebhookEventType, { each: true })
  eventTypes: WebhookEventType[];

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateWebhookDto {
  @IsOptional()
  @IsUrl()
  url?: string;

  @IsOptional()
  @IsArray()
  @IsEnum(WebhookEventType, { each: true })
  eventTypes?: WebhookEventType[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  description?: string;
}

export class VerifyWebhookDto {
  @IsString()
  challenge: string;
}

export class WebhookChallengeResponse {
  challenge: string;
}

export class WebhookDeliveryLogDto {
  id: string;
  webhookId: string;
  eventType: string;
  payload: any;
  status: string;
  responseCode: number | null;
  attempts: number;
  maxAttempts: number;
  error: string | null;
  deliveredAt: Date | null;
  createdAt: Date;
}
