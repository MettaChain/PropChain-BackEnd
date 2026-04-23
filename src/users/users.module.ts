import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { AvatarUploadController } from './avatar-upload.controller';
import { AvatarUploadService } from './avatar-upload.service';
import { ProfileController } from './profile.controller';
import { PrismaModule } from '../database/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [UsersController, AvatarUploadController, ProfileController],
  providers: [UsersService, AvatarUploadService],
  exports: [UsersService, AvatarUploadService],
})
export class UsersModule {}
