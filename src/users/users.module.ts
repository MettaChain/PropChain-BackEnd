import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { AvatarUploadController } from './avatar-upload.controller';
import { AvatarUploadService } from './avatar-upload.service';
import { ScheduledDeletionService } from './scheduled-deletion.service';
import { UserImportController } from './user-import.controller';
import { UserImportService } from './user-import.service';
import { PrismaModule } from '../database/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule, ScheduleModule.forRoot()],
  controllers: [UsersController, AvatarUploadController, UserImportController],
  providers: [UsersService, AvatarUploadService, ScheduledDeletionService, UserImportService],
  exports: [UsersService, AvatarUploadService, ScheduledDeletionService, UserImportService],
})
export class UsersModule {}
