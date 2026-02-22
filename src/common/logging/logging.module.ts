import { Module, Global, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StructuredLoggerService } from './logger.service';
import { LoggingMiddleware } from './logging.middleware';
import { MetricsService } from './metrics.service';
import { ErrorMonitoringService } from './error-monitoring.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [StructuredLoggerService, MetricsService, ErrorMonitoringService],
  exports: [StructuredLoggerService, MetricsService, ErrorMonitoringService],
})
export class LoggingModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggingMiddleware).forRoutes('*');
  }
}
