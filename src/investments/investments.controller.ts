import { BadRequestException, Controller, Get, Param, UseInterceptors } from '@nestjs/common';
import { InvestmentsService } from './investments.service';
import { TraceInterceptor } from '../tracing/trace.interceptor';

// Issue #1409 – Only allow safe ID characters to block injection payloads.
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

// Issue #1408 – Distributed tracing via the shared TraceInterceptor.
@UseInterceptors(TraceInterceptor)
@Controller('investments')
export class InvestmentsController {
  constructor(private readonly investmentsService: InvestmentsService) {}

  @Get('health')
  health() {
    return this.investmentsService.health();
  }

  @Get(':propertyId/metrics')
  getMetrics(@Param('propertyId') propertyId: string) {
    if (!SAFE_ID.test(propertyId)) {
      throw new BadRequestException('Invalid property id');
    }
    return this.investmentsService.getMetrics(propertyId);
  }
}
