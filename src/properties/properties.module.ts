// @ts-nocheck

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
import { PropertiesResolver } from './properties.resolver';
import { PubSub } from 'graphql-subscriptions';
import { FraudModule } from '../fraud/fraud.module';
import { PropertyReportService } from './report/property-report.service';
import { CacheModuleConfig } from '../cache/cache.module';

@Module({
  imports: [PrismaModule, AuthModule, FraudModule, ConfigModule, CacheModuleConfig, NotificationsModule],
  controllers: [PropertiesController, PropertyImagesController],
  providers: [
    PropertiesService,
    PropertyImagesService,
    GeocodingService,
    PropertyExpiryService,
    PropertiesResolver,
    PropertyReportService,
    {
      provide: 'PUB_SUB',
      useValue: new PubSub(),
    },
  ],
  exports: [PropertiesService, PropertyReportService, PropertyImagesService, GeocodingService, PropertyExpiryService],
})
export class PropertiesModule {}
