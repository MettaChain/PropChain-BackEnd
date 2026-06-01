import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { UserPreferencesService } from './user-preferences.service';
import { UserPreferencesController } from './user-preferences.controller';
import { ActivityLogService } from './activity-log.service';
import { ActivityLogController, AdminActivityLogController } from './activity-log.controller';
import { PrismaModule } from '../database/prisma.module';
import { SessionsModule } from '../sessions/sessions.module';
import { UsersResolver } from './users.resolver';
import { EmailVerificationController } from './email-verification.controller';
import { EmailVerificationService } from './email-verification.service';
import { EmailService } from '../email/email.service';
import { RateLimitService } from '../auth/rate-limit.service';

@Module({
  imports: [PrismaModule, SessionsModule],
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
    UsersResolver,
    EmailVerificationService,
    EmailService,
    RateLimitService,
  ],
  exports: [UsersService, UserPreferencesService, ActivityLogService, EmailVerificationService],
})
export class UsersModule {}
