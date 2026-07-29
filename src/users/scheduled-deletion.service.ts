// @ts-nocheck

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AccountDeletionService } from './account-deletion.service';

@Injectable()
export class ScheduledDeletionService {
  private readonly logger = new Logger(ScheduledDeletionService.name);

  constructor(private readonly accountDeletionService: AccountDeletionService) {}

  /**
   * Run daily at 2:00 AM to delete deactivated users
   * whose scheduled deletion time has passed (issue #960).
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async handleScheduledDeletion() {
    this.logger.log('Running scheduled deletion job for deactivated users...');

    try {
      const result = await this.accountDeletionService.performScheduledDeletion();

      if (result.deletedCount > 0) {
        this.logger.log(
          `Successfully deleted ${result.deletedCount} deactivated users ` +
            `(${result.blockedByLegalHold} blocked by legal hold).`,
        );
      } else {
        this.logger.log('No users scheduled for deletion at this time');
      }
    } catch (error) {
      this.logger.error('Error during scheduled deletion:', error);
    }
  }

  /**
   * Manual trigger for testing or immediate deletion.
   */
  async triggerManualDeletion() {
    this.logger.log('Manual deletion triggered');
    return this.accountDeletionService.performScheduledDeletion();
  }
}
