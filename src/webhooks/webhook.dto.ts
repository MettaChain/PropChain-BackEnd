import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
} from 'class-validator';

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