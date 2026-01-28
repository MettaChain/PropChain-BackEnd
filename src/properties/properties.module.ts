import { Module } from '@nestjs/common';
import { ValuationModule } from '../valuation/valuation.module';

@Module({
  imports: [ValuationModule],
})
export class PropertiesModule {}