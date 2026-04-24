import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
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
import { FraudModule } from './fraud/fraud.module';
import { CacheModuleConfig } from './cache/cache.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { AppController } from './app.controller';
import './common/common.types'; // Load registered enums
import { AdminModule } from './admin/admin.module';
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
    FraudModule,
    AdminModule,
    DocumentsModule,
    IntegrationsModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
