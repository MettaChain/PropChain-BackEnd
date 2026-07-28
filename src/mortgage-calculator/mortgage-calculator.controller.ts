// @ts-nocheck

import { Body, Controller, Post } from '@nestjs/common';
import { MortgageCalculatorService } from './mortgage-calculator.service';
import {
  MortgageCalculatorDto,
  AmortizationScheduleDto,
  CompareScenariosDto,
  ExportAmortizationDto,
} from './dto/mortgage-calculator.dto';

@Controller('mortgage-calculator')
export class MortgageCalculatorController {
  constructor(private readonly mortgageCalculatorService: MortgageCalculatorService) {}

  @Post()
  calculate(@Body() dto: MortgageCalculatorDto) {
    return this.mortgageCalculatorService.calculate(dto);
  }

  @Post('amortization')
  generateAmortization(@Body() dto: AmortizationScheduleDto) {
    return this.mortgageCalculatorService.generateAmortizationSchedule(dto);
  }

  @Post('compare')
  compareScenarios(@Body() dto: CompareScenariosDto) {
    return this.mortgageCalculatorService.compareScenarios(dto.scenarios);
  }

  @Post('export')
  exportAmortization(@Body() dto: ExportAmortizationDto) {
    const csv = this.mortgageCalculatorService.exportAmortization(
      dto.schedule,
      dto.format || 'csv',
    );
    return { data: csv, format: dto.format || 'csv' };
  }
}
