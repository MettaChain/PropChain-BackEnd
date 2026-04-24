import { Controller, Get, Delete, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../types/prisma.types';

@Controller('analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get()
  getStats() {
    return this.analytics.getStats();
  }

  @Delete('reset')
  reset() {
    this.analytics.reset();
    return { message: 'Analytics reset' };
  }
}
