import { Controller, Get, Query, UseInterceptors } from '@nestjs/common';
import { ListingsService } from './listings.service';
import { TraceInterceptor } from '../tracing/trace.interceptor';

@Controller('listings')
@UseInterceptors(TraceInterceptor)
export class ListingsController {
  constructor(private readonly listingsService: ListingsService) {}

  @Get()
  findAll(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.listingsService.findAll(Number(page) || 1, Number(limit) || 10);
  }

  @Get('health')
  health() {
    return this.listingsService.checkHealth();
  }
}
