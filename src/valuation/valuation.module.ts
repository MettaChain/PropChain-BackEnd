import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ValuationService } from './valuation.service';
import { ValuationController } from './valuation.controller';
import { PrismaModule } from '../database/prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,

  ],
  controllers: [ValuationController],
  providers: [ValuationService],
  exports: [ValuationService],
})
export class ValuationModule {}