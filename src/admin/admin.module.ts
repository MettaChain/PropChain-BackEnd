// @ts-nocheck

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

@Module({
  imports: [PrismaModule, FraudModule, BackupModule, TransactionsModule, SessionsModule, QueueModule],
  controllers: [AdminController],
  providers: [AdminService, AdminAuditInterceptor],
  exports: [AdminService],
})
export class AdminModule {}
