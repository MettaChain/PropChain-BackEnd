import { Module } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { TransactionsController } from './transactions.controller';
import { DisputesService } from './disputes.service';
import { DisputesController } from './disputes.controller';
import { TransactionFeesService } from './transaction-fees.service';
import { TransactionNotesService } from './transaction-notes.service';
import { TransactionRemindersService } from './transaction-reminders.service';
import { TransactionAuditService } from './transaction-audit.service';
import { TimelineService } from './timeline.service';
import { PrismaModule } from '../database/prisma.module';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CommissionsModule } from '../commissions/commissions.module';

@Module({
  imports: [PrismaModule, BlockchainModule, NotificationsModule, CommissionsModule],
  providers: [
    TransactionsService,
    DisputesService,
    TransactionFeesService,
    TransactionNotesService,
    TransactionRemindersService,
  TransactionAuditService, 
  TimelineService,
  ],
  controllers: [TransactionsController, DisputesController],
  exports: [TransactionsService, TransactionFeesService, TransactionNotesService, TransactionAuditService, TimelineService],
})
export class TransactionsModule {}
