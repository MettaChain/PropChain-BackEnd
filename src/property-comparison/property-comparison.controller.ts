// @ts-nocheck

import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { PropertyComparisonService } from './property-comparison.service';
import { CompareBodyDto, CompareQueryDto } from './dto/comparison.dto';

@Controller('property-comparison')
export class PropertyComparisonController {
  constructor(private readonly comparisonService: PropertyComparisonService) {}

  @Get()
  compareGet(@Query() query: CompareQueryDto) {
    return this.comparisonService.compare(query.ids);
  }

  @Post()
  comparePost(@Body() body: CompareBodyDto) {
    return this.comparisonService.compare(body.ids);
  }

  @Post('score')
  calculateScore(@Body() body: { properties: any[] }) {
    return this.comparisonService.calculateScore(body.properties);
  }

  @Post('share')
  createShareableLink(@Body() body: { propertyIds: string[]; userId?: string }) {
    return this.comparisonService.createShareableLink(body.propertyIds, body.userId);
  }

  @Get('shared/:shareToken')
  getSharedComparison(@Param('shareToken') shareToken: string) {
    return this.comparisonService.getSharedComparison(shareToken);
  }

  @Post('export')
  exportComparison(@Body() body: { propertyIds: string[] }) {
    return this.comparisonService.exportComparison(body.propertyIds);
  }
}
