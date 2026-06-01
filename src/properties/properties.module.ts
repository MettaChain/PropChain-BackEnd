import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PropertiesService } from './properties.service';
import { PropertiesController } from './properties.controller';
import { PropertyImagesService } from './property-images.service';
import { PropertyImagesController } from './property-images.controller';
import { GeocodingService } from './geocoding.service';
import { PrismaModule } from '../database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { PropertiesResolver } from './properties.resolver';
import { PubSub } from 'graphql-subscriptions';
import { FraudModule } from '../fraud/fraud.module';
import { PriceHistoryModule } from '../price-history/price-history.module';

@Module({
  imports: [PrismaModule, AuthModule, FraudModule, ConfigModule, PriceHistoryModule],
  controllers: [PropertiesController, PropertyImagesController],
  providers: [
    PropertiesService,
    PropertyImagesService,
    GeocodingService,
    PropertiesResolver,
    {
      provide: 'PUB_SUB',
      useValue: new PubSub(),
    },
  ],
  exports: [PropertiesService, PropertyImagesService, GeocodingService],
})
export class PropertiesModule {}
