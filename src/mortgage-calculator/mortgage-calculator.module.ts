import { Module } from '@nestjs/common';
import { MortgageCalculatorController } from './mortgage-calculator.controller';
import { MortgageCalculatorService } from './mortgage-calculator.service';

@Module({
  controllers: [MortgageCalculatorController],
  providers: [MortgageCalculatorService],
})
export class MortgageCalculatorModule {}
