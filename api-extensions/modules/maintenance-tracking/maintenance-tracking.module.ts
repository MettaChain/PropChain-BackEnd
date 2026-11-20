import { Module } from '@nestjs/common';
import { NotificationsService } from '../../services/notifications.service';
import { MaintenanceTrackingController } from './maintenance-tracking.controller';
import { MaintenanceTrackingService } from './maintenance-tracking.service';

@Module({
  controllers: [MaintenanceTrackingController],
  providers: [MaintenanceTrackingService, NotificationsService],
  exports: [MaintenanceTrackingService],
})
export class MaintenanceTrackingModule {}
