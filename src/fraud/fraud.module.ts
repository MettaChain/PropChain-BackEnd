import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module';
import { EmailModule } from '../email/email.module';
import { AuthModule } from '../auth/auth.module';
import { FraudController } from './fraud.controller';
import { FraudService } from './fraud.service';

@Module({
  imports: [PrismaModule, EmailModule, forwardRef(() => AuthModule)],
  controllers: [FraudController],
  providers: [FraudService],
  exports: [FraudService],
})
export class FraudModule {}
