// @ts-nocheck

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../database/prisma.module';
import { EmailModule } from '../email/email.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { FraudService } from './fraud.service';

@Module({
  imports: [ConfigModule, PrismaModule, EmailModule, NotificationsModule],
  providers: [FraudService],
  exports: [FraudService],
})
export class FraudModule {}
