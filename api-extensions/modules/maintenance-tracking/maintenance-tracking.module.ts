import { Module } from '@nestjs/common';
import { MaintenanceTrackingController } from './maintenance-tracking.controller';
import { MaintenanceTrackingService } from './maintenance-tracking.service';

@Module({
  controllers: [MaintenanceTrackingController],
  providers: [MaintenanceTrackingService],
  exports: [MaintenanceTrackingService],
})
export class MaintenanceTrackingModule {}
