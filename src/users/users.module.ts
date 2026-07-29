// @ts-nocheck

import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { UserPreferencesService } from './user-preferences.service';
import { UserPreferencesController } from './user-preferences.controller';
import { ActivityLogService } from './activity-log.service';
import { ActivityLogController, AdminActivityLogController } from './activity-log.controller';
import { PrismaModule } from '../database/prisma.module';
import { SessionsModule } from '../sessions/sessions.module';

import { EmailVerificationController } from './email-verification.controller';
import { EmailVerificationService } from './email-verification.service';
import { EmailService } from '../email/email.service';
import { RateLimitService } from '../auth/rate-limit.service';

import { AccountDeletionService } from './account-deletion.service';
import { DataExportService } from './data-export.service';
import { I18nModule } from '../i18n/i18n.module';

@Module({
  imports: [PrismaModule, SessionsModule, I18nModule],
  controllers: [
    UsersController,
    UserPreferencesController,
    ActivityLogController,
    AdminActivityLogController,
    EmailVerificationController,
  ],
  providers: [
    UsersService,
    UserPreferencesService,
    ActivityLogService,
    EmailVerificationService,
    EmailService,
    RateLimitService,
    AccountDeletionService,
    DataExportService,
  ],
  exports: [
    UsersService,
    UserPreferencesService,
    ActivityLogService,
    EmailVerificationService,
    AccountDeletionService,
    DataExportService,
  ],
})
export class UsersModule {}
