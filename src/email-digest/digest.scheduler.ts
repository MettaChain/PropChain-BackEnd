import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EmailDigestService } from './email-digest.service';
import { DigestFrequency } from '@prisma/client';

@Injectable()
export class DigestScheduler {
  private readonly logger = new Logger(DigestScheduler.name);

  constructor(private readonly emailDigestService: EmailDigestService) {}

  // Every day at 8:00 AM UTC
  @Cron('0 8 * * *')
  async runDailyDigest() {
    this.logger.log('Running daily digest...');
    await this.emailDigestService.sendDigestsForFrequency(DigestFrequency.DAILY);
  }

  // Every Monday at 8:00 AM UTC
  @Cron('0 8 * * 1')
  async runWeeklyDigest() {
    this.logger.log('Running weekly digest...');
    await this.emailDigestService.sendDigestsForFrequency(DigestFrequency.WEEKLY);
  }
}
