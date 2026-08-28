import { Module } from '@nestjs/common';
import { EmailDigestService } from './email-digest.service';
import { EmailDigestController } from './email-digest.controller';
import { DigestScheduler } from './digest.scheduler';
import { PrismaModule } from '../database/prisma.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [PrismaModule, EmailModule],
  controllers: [EmailDigestController],
  providers: [EmailDigestService, DigestScheduler],
  exports: [EmailDigestService],
})
export class EmailDigestModule {}
