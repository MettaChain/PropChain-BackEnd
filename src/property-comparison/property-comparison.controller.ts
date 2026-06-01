import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { PropertyComparisonService } from './property-comparison.service';
import { CompareBodyDto, CompareQueryDto } from './dto/comparison.dto';

@Controller('property-comparison')
export class PropertyComparisonController {
  constructor(private readonly comparisonService: PropertyComparisonService) {}

  /**
   * Compare 2-4 properties via query string:
   *   GET /property-comparison?ids=uuid1,uuid2,uuid3
   */
  @Get()
  compareGet(@Query() query: CompareQueryDto) {
    return this.comparisonService.compare(query.ids);
  }

  /**
   * Compare 2-4 properties via JSON body:
   *   POST /property-comparison  { "ids": ["uuid1", "uuid2", ...] }
   */
  @Post()
  comparePost(@Body() body: CompareBodyDto) {
    return this.comparisonService.compare(body.ids);
  }
}
