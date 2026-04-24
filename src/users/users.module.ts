import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { UserPreferencesService } from './user-preferences.service';
import { UserPreferencesController } from './user-preferences.controller';
import { ActivityLogService } from './activity-log.service';
import { ActivityLogController, AdminActivityLogController } from './activity-log.controller';
import { PrismaModule } from '../database/prisma.module';
import { UsersResolver } from './users.resolver';

@Module({
  imports: [PrismaModule],
  controllers: [
    UsersController,
    UserPreferencesController,
    ActivityLogController,
    AdminActivityLogController,
  ],
  providers: [UsersService, UserPreferencesService, ActivityLogService, UsersResolver],
  exports: [UsersService, UserPreferencesService, ActivityLogService],
})
export class UsersModule {}
