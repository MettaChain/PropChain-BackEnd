// @ts-nocheck

import { Module, forwardRef } from '@nestjs/common';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { SmsService } from './sms.service';
import { PrismaModule } from '../database/prisma.module';
import { EmailModule } from '../email/email.module';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, EmailModule, UsersModule, AuthModule],
  controllers: [NotificationsController],
  providers: [NotificationsGateway, NotificationsService, SmsService],
  exports: [NotificationsService, SmsService],
})
export class NotificationsModule {}