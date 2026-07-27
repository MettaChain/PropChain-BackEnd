import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminAuditInterceptor } from './admin-audit.interceptor';
import { PrismaModule } from '../database/prisma.module';
import { FraudModule } from '../fraud/fraud.module';
import { BackupModule } from '../backup/backup.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { SessionsModule } from '../sessions/sessions.module';
import { QueueModule } from './queue/queue.module';
// Issue #919 – Archive module
import { ArchiveModule } from '../archive/archive.module';
// Issue #920 – Cleanup service
import { CleanupService } from '../database/cleanup.service';

@Module({
  imports: [
    PrismaModule,
    FraudModule,
    BackupModule,
    TransactionsModule,
    SessionsModule,
    QueueModule,
    ArchiveModule,
  ],
  controllers: [AdminController],
  providers: [AdminService, AdminAuditInterceptor, CleanupService],
  exports: [AdminService],
})
export class AdminModule {}
