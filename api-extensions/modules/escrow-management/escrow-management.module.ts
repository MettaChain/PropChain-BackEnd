import { Module } from '@nestjs/common';
import { AuthModule } from '../../../src/auth/auth.module';
import { PrismaModule } from '../../../src/database/prisma.module';
import { PrismaService } from '../../../src/database/prisma.service';
import { TransactionFeesService } from '../../../src/transactions/transaction-fees.service';
import { EscrowManagementController } from './escrow-management.controller';
import { ESCROW_MANAGEMENT_PRISMA, EscrowManagementService } from './escrow-management.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [EscrowManagementController],
  providers: [
    EscrowManagementService,
    TransactionFeesService,
    { provide: ESCROW_MANAGEMENT_PRISMA, useExisting: PrismaService },
  ],
  exports: [EscrowManagementService],
})
export class EscrowManagementModule {}
