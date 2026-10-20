import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PropertiesService } from './properties.service';
import { PropertiesController } from './properties.controller';
import { PropertyImagesService } from './property-images.service';
import { PropertyImagesController } from './property-images.controller';
import { GeocodingService } from './geocoding.service';
import { PropertyExpiryService } from './property-expiry.service';
import { PrismaModule } from '../database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';

import { FraudModule } from '../fraud/fraud.module';
import { DocumentsModule } from '../documents/documents.module';
import { PropertyReportService } from './report/property-report.service';
import { CacheModuleConfig } from '../cache/cache.module';
import { PropertiesHealthController } from './properties-health.controller';
import { PropertiesHealthIndicator } from './properties-health.indicator';
import { PropertyInjectionGuardPipe } from './pipes/injection-guard.pipe';
import { PropertiesListingsCacheService } from './properties-listings-cache.service';
import { PropertiesCacheService } from './properties-cache.service';
import { PropertiesRouteRateLimitGuard } from './guards/properties-route-rate-limit.guard';
import { RateLimitService } from '../auth/rate-limit.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    FraudModule,
    ConfigModule,
    CacheModuleConfig,
    DocumentsModule,
    NotificationsModule,
  ],
  controllers: [
    // Before PropertiesController: `GET /properties/health` must not match
    // `GET /properties/:id`.
    PropertiesHealthController,
    PropertiesController,
    PropertyImagesController,
  ],
  providers: [
    PropertiesService,
    PropertyImagesService,
    GeocodingService,
    PropertyExpiryService,
    PropertyReportService,
    PropertiesHealthIndicator,
    PropertyInjectionGuardPipe,
    PropertiesListingsCacheService,
    PropertiesCacheService,
    RateLimitService,
    PropertiesRouteRateLimitGuard,
  ],
  exports: [
    PropertiesService,
    PropertyReportService,
    PropertyImagesService,
    GeocodingService,
    PropertyExpiryService,
    PropertiesListingsCacheService,
    PropertiesCacheService,
  ],
})
export class PropertiesModule {}
