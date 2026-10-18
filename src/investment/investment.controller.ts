import { Controller, Get, Query } from '@nestjs/common';
import { QueryInvestmentDto } from './dto/query-investment.dto';
import { InvestmentService } from './investment.service';

@Controller('investments')
export class InvestmentController {
  constructor(private readonly investmentService: InvestmentService) {}

  @Get()
  findAll(@Query() query: QueryInvestmentDto) {
    return this.investmentService.findAll(query.page, query.limit);
  }
}
