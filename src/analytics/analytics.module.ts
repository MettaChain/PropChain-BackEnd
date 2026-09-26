// @ts-nocheck

import { Module, Global } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsInterceptor } from './analytics.interceptor';
import { AnalyticsGateway } from './analytics.gateway';
import { DashboardMetricsService } from './dashboard-metrics.service';
import { PrismaModule } from '../database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { QueueModule } from '../admin/queue/queue.module';

@Global()
@Module({
  imports: [PrismaModule, ScheduleModule.forRoot(), AuthModule, QueueModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AnalyticsInterceptor, AnalyticsGateway, DashboardMetricsService],
  exports: [AnalyticsService, AnalyticsInterceptor, DashboardMetricsService],
})
export class AnalyticsModule {}
