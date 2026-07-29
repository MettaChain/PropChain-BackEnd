import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
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
import { RequestIdMiddleware } from './common/request-id.middleware';
import { AdminModule } from './admin/admin.module';
import { FraudModule } from './fraud/fraud.module';
import { SearchModule } from './search/search.module';
import { BackupModule } from './backup/backup.module';
import { TrackingModule } from './tracking/tracking.module';
import { NotificationsModule } from './notifications/notifications.module';
import { BlockchainModule } from './blockchain/blockchain.module';
import { TransactionsModule } from './transactions/transactions.module';
import { CommissionsModule } from './commissions/commissions.module';
import { FavoritesModule } from './favorites/favorites.module';
import { PropertyViewsModule } from './property-views/property-views.module';
import { PropertyComparisonModule } from './property-comparison/property-comparison.module';
import { OpenHouseModule } from './open-house/open-house.module';
import { MortgageCalculatorModule } from './mortgage-calculator/mortgage-calculator.module';
import { SupportTicketsModule } from './support-tickets/support-tickets.module';
import { AuditModule } from './audit/audit.module';
import { MetricsModule } from './metrics/metrics.module';
import { PropertyTaxModule } from './properties/tax/property-tax.module';
import { ResponseFormatInterceptor } from './common/interceptors/response-format.interceptor';
import { VersionHeaderInterceptor } from './versioning/version-header.interceptor';
import { DeprecationWarningInterceptor } from './versioning/deprecation-warning.interceptor';
import { RateLimitHeadersInterceptor } from './auth/interceptors/rate-limit-headers.interceptor';
// Issue #925 – K8s health probes
import { HealthModule } from './health/health.module';
// Issue #919 – Data archival strategy
import { ArchiveModule } from './archive/archive.module';
// Issue #920 – Automated cleanup of expired records
import { CleanupService } from './database/cleanup.service';
// Issue #964 – Localized error messages with i18n
import { I18nModule } from './i18n/i18n.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ValidationExceptionFilter } from './common/filters/validation-exception.filter';
import { APP_FILTER } from '@nestjs/core';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    ScheduleModule.forRoot(),
    CacheModuleConfig,
    AnalyticsModule,
    PrismaModule,
    VersioningModule,
    I18nModule,
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
    CommissionsModule,
    FavoritesModule,
    PropertyViewsModule,
    PropertyComparisonModule,
    OpenHouseModule,
    MortgageCalculatorModule,
    SupportTicketsModule,
    AuditModule,
    MetricsModule,
    PropertyTaxModule,
    HealthModule,
    ArchiveModule,
  ],

  controllers: [AppController],
  providers: [
    ResponseFormatInterceptor,
    VersionHeaderInterceptor,
    DeprecationWarningInterceptor,
    RateLimitHeadersInterceptor,
    // Issue #920 – Cleanup service registers the @Cron scheduler
    CleanupService,
    // Issue #964 – Register the i18n-aware exception filters globally via
    // APP_FILTER so NestJS injects I18nService into them.
    { provide: APP_FILTER, useClass: ValidationExceptionFilter },
    { provide: APP_FILTER, useClass: PrismaExceptionFilter },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
