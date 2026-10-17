import { Module } from '@nestjs/common';
import { InvestmentsController } from './investments.controller';
import { InvestmentsService } from './investments.service';
import { InvestmentRateLimitGuard } from './investment-rate-limit.guard';

@Module({
  controllers: [InvestmentsController],
  providers: [InvestmentsService, InvestmentRateLimitGuard],
})
export class InvestmentsModule {}
