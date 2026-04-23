import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { AvatarUploadController } from './avatar-upload.controller';
import { AvatarUploadService } from './avatar-upload.service';
import { ProfileController } from './profile.controller';
import { UserPreferencesService } from './user-preferences.service';
import { UserPreferencesController } from './user-preferences.controller';
import { ActivityLogService } from './activity-log.service';
import { ActivityLogController, AdminActivityLogController } from './activity-log.controller';
import { PrismaModule } from '../database/prisma.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [UsersController, AvatarUploadController, ProfileController],
  providers: [UsersService, AvatarUploadService],
  exports: [UsersService, AvatarUploadService],
  imports: [PrismaModule],
  controllers: [
    UsersController,
    UserPreferencesController,
    ActivityLogController,
    AdminActivityLogController,
  ],
  providers: [UsersService, UserPreferencesService, ActivityLogService],
  exports: [UsersService, UserPreferencesService, ActivityLogService],
})
export class UsersModule {}
