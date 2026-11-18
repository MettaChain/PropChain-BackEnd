import { Module } from '@nestjs/common';
import { CommissionSplitController } from './commission-split.controller';
import { CommissionSplitService } from './commission-split.service';

@Module({
  controllers: [CommissionSplitController],
  providers: [CommissionSplitService],
  exports: [CommissionSplitService],
})
export class CommissionSplitModule {}
