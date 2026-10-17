import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { InvestmentsService } from './investments.service';
import { CreateInvestmentDto, InvestmentResponseDto } from './dto/create-investment.dto';
import { InvestmentRateLimitGuard } from './investment-rate-limit.guard';

@ApiTags('investments')
@Controller('investments')
@UseGuards(InvestmentRateLimitGuard)
export class InvestmentsController {
  constructor(private readonly investmentsService: InvestmentsService) {}

  @Post()
  @ApiOperation({ summary: 'Create an investment' })
  @ApiResponse({ status: 201, type: InvestmentResponseDto })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  create(@Body() dto: CreateInvestmentDto) {
    return this.investmentsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List investments (cached)' })
  @ApiResponse({ status: 200, type: [InvestmentResponseDto] })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  findAll() {
    return this.investmentsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an investment by ID (cached)' })
  @ApiResponse({ status: 200, type: InvestmentResponseDto })
  @ApiResponse({ status: 404, description: 'Investment not found' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  findOne(@Param('id') id: string) {
    return this.investmentsService.findOne(id);
  }
}
