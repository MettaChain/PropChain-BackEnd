import { Module } from '@nestjs/common';
import { PropertyValuationController } from './property-valuation.controller';
import { PropertyValuationService } from './property-valuation.service';

@Module({
  controllers: [PropertyValuationController],
  providers: [PropertyValuationService],
  exports: [PropertyValuationService],
})
export class PropertyValuationModule {}
