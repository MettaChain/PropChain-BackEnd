import { Module } from '@nestjs/common';
import { AmenityManagementController } from './amenity-management.controller';
import { AmenityManagementService } from './amenity-management.service';

@Module({
  controllers: [AmenityManagementController],
  providers: [AmenityManagementService],
  exports: [AmenityManagementService],
})
export class AmenityManagementModule {}
