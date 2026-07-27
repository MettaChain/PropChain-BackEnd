// @ts-nocheck

import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import {
  SmsService,
  SmsProviderFactory,
  TwilioSmsProvider,
  AwsSnsSmsProvider,
  MockSmsProvider,
} from './sms.service';
import { PrismaModule } from '../database/prisma.module';
import { EmailModule } from '../email/email.module';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, EmailModule, UsersModule, ConfigModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsGateway,
    NotificationsService,
    TwilioSmsProvider,
    AwsSnsSmsProvider,
    MockSmsProvider,
    SmsProviderFactory,
    SmsService,
  ],
  exports: [NotificationsService, SmsService, SmsProviderFactory],
})
export class NotificationsModule {}