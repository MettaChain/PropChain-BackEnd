import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { ScheduleModule } from '@nestjs/schedule';
import { join } from 'path';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { SessionsModule } from './sessions/sessions.module';
import { TrustScoreModule } from './trust-score/trust-score.module';
import { PropertiesModule } from './properties/properties.module';
import { DocumentsModule } from './documents/documents.module';
import { PrismaModule } from './database/prisma.module';
import { VersioningModule } from './versioning/versioning.module';
import { ApiDocumentationModule } from './config/api-documentation.module';
import { CacheModuleConfig } from './cache/cache.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { AppController } from './app.controller';
import './common/common.types'; // Load registered enums
import { AdminModule } from './admin/admin.module';
import { FraudModule } from './fraud/fraud.module';
import { SearchModule } from './search/search.module';
import { BackupModule } from './backup/backup.module';
import { TrackingModule } from './tracking/tracking.module';
import { NotificationsModule } from './notifications/notifications.module';
import { BlockchainModule } from './blockchain/blockchain.module';
import { TransactionsModule } from './transactions/transactions.module';
import { FavoritesModule } from './favorites/favorites.module';
import { PropertyViewsModule } from './property-views/property-views.module';
import { PropertyComparisonModule } from './property-comparison/property-comparison.module';
import { OpenHouseModule } from './open-house/open-house.module';
import { PriceHistoryModule } from './price-history/price-history.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
      sortSchema: true,
      playground: true,
      subscriptions: {
        'graphql-ws': true,
      },
    }),
    ScheduleModule.forRoot(),
    CacheModuleConfig,
    AnalyticsModule,
    PrismaModule,
    VersioningModule,
    ApiDocumentationModule,
    UsersModule,
    AuthModule,
    DashboardModule,
    SessionsModule,
    TrustScoreModule,
    PropertiesModule,
    AdminModule,
    FraudModule,
    DocumentsModule,
    IntegrationsModule,
    SearchModule,
    BackupModule,
    TrackingModule,
    NotificationsModule,
    BlockchainModule,
    TransactionsModule,
    FavoritesModule,
    PropertyViewsModule,
    PropertyComparisonModule,
    NeighborhoodsModule,
    OpenHouseModule,
    PriceHistoryModule,
  ],

  controllers: [AppController],
})
export class AppModule {}
