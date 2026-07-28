// @ts-nocheck

import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { PropertyTaxService } from './property-tax.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@Controller('properties')
export class PropertyTaxController {
  constructor(private readonly taxService: PropertyTaxService) {}

  @UseGuards(JwtAuthGuard)
  @Get(':id/tax-history')
  async getTaxHistory(@Param('id') id: string) {
    return this.taxService.getTaxHistory(id);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/tax-summary')
  async getTaxSummary(@Param('id') id: string) {
    return this.taxService.getTaxSummary(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('tax/compare')
  async compareTax(@Body() body: { propertyIds: string[] }) {
    return this.taxService.compareTax(body.propertyIds);
  }
}
