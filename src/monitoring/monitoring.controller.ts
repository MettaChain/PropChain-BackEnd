import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { MonitoringService } from './monitoring.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../types/prisma.types';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('monitoring')
export class MonitoringController {
  constructor(private readonly monitoringService: MonitoringService) {}

  @Get('summary')
  getSummary() {
    return this.monitoringService.getSummary();
  }

  @Get('requests')
  getRequestCounts(@Query('since') since?: string) {
    return this.monitoringService.getRequestCounts(
      since ? new Date(since) : undefined,
    );
  }

  @Get('errors')
  getErrorRates(@Query('since') since?: string) {
    return this.monitoringService.getErrorRates(
      since ? new Date(since) : undefined,
    );
  }

  @Get('slow')
  getSlowEndpoints(
    @Query('threshold') threshold?: string,
    @Query('since') since?: string,
  ) {
    return this.monitoringService.getSlowEndpoints(
      threshold ? parseInt(threshold) : 1000,
      since ? new Date(since) : undefined,
    );
  }

  @Get('usage-by-user')
  getUsageByUser(@Query('since') since?: string) {
    return this.monitoringService.getUsageByUser(
      since ? new Date(since) : undefined,
    );
  }
}