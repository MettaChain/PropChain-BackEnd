import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../database/prisma.module';
import { BackupService } from './backup.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [ConfigModule, PrismaModule, NotificationsModule],
  providers: [BackupService],
  exports: [BackupService],
})
export class BackupModule {}
