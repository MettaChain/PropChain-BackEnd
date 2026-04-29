import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../database/prisma.module';
import { BackupService } from './backup.service';

@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [BackupService],
  exports: [BackupService],
})
export class BackupModule {}
