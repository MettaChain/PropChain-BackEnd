import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { UsersService } from '../users/users.service';

@Injectable()
export class ScheduledDeletionService {
  private readonly logger = new Logger(ScheduledDeletionService.name);

  constructor(private readonly usersService: UsersService) {}

  /**
   * Run daily at 2:00 AM to delete deactivated users
   * whose scheduled deletion time has passed
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async handleScheduledDeletion() {
    this.logger.log('Running scheduled deletion job for deactivated users...');

    try {
      const result = await this.usersService.deleteDeactivatedUsers();

      if (result.deletedCount > 0) {
        this.logger.log(`Successfully deleted ${result.deletedCount} deactivated users`);
      } else {
        this.logger.log('No users scheduled for deletion at this time');
      }
    } catch (error) {
      this.logger.error('Error during scheduled deletion:', error);
    }
  }

  /**
   * Manual trigger for testing or immediate deletion
   */
  async triggerManualDeletion() {
    this.logger.log('Manual deletion triggered');
    return this.usersService.deleteDeactivatedUsers();
  }
}
