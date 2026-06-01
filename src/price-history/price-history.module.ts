import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PriceHistoryService } from './price-history.service';
import { PriceHistoryController } from './price-history.controller';
import { PriceHistoryPermissionGuard } from './guards/price-history-permission.guard';
import { PriceHistoryCacheInterceptor } from './interceptors/price-history-cache.interceptor';
import { PrismaModule } from '../database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { CacheModuleConfig } from '../cache/cache.module';
import { NotificationsModule } from '../notifications/notifications.module';

/**
 * PriceHistoryModule
 * Manages price history tracking, retrieval, and analysis
 * Validates: Requirements 1.1, 5.1
 */
@Module({
  imports: [PrismaModule, AuthModule, CacheModuleConfig, NotificationsModule],
  providers: [
    PriceHistoryService,
    PriceHistoryPermissionGuard,
    {
      provide: APP_INTERCEPTOR,
      useClass: PriceHistoryCacheInterceptor,
    },
  ],
  controllers: [PriceHistoryController],
  exports: [PriceHistoryService],
})
export class PriceHistoryModule {}
