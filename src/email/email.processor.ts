// @ts-nocheck

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { MailerService } from '@nestjs-modules/mailer';
import { Logger } from '@nestjs/common';

interface EmailJobData {
  to: string;
  subject: string;
  template: string;
  context: Record<string, unknown>;
}

@Processor('mail')
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(private readonly mailerService: MailerService) {
    super();
  }

  async process(job: Job<EmailJobData, void, string>): Promise<void> {
    const { to, subject, template, context } = job.data;

    this.logger.log(`Processing email job ${job.id} for ${to} with subject: ${subject}`);

    try {
      await this.mailerService.sendMail({
        to,
        subject,
        template,
        context,
      });
      this.logger.log(`Email sent successfully to ${to}`);
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}: ${error.message}`, error.stack);
      throw error; // BullMQ will handle retries if configured
    }
  }
}
