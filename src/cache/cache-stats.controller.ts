import { Controller, Get, Delete, UseGuards } from '@nestjs/common';
import { CacheMonitoringService } from './cache-monitoring.service';
import { CacheService } from './cache.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../types/prisma.types';

@Controller('cache')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class CacheStatsController {
  constructor(
    private readonly monitoring: CacheMonitoringService,
    private readonly cacheService: CacheService,
  ) {}

  @Get('stats')
  getStats() {
    return this.monitoring.getMetrics();
  }

  @Delete('clear')
  async clearCache() {
    await this.cacheService.clear();
    this.monitoring.resetMetrics();
    return { message: 'Cache cleared' };
  }
}
