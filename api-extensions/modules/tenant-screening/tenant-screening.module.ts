import { Module } from '@nestjs/common';
import { TenantScreeningController } from './tenant-screening.controller';
import { TenantScreeningService } from './tenant-screening.service';

@Module({
  controllers: [TenantScreeningController],
  providers: [TenantScreeningService],
  exports: [TenantScreeningService],
})
export class TenantScreeningModule {}
