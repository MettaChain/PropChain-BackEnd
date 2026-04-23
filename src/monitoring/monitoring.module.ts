import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { MonitoringController } from './monitoring.controller';
import { MonitoringService } from './monitoring.service';
import { MonitoringMiddleware } from './monitoring.middleware';
import { PrismaModule } from '../database/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [MonitoringController],
  providers: [MonitoringService, MonitoringMiddleware],
  exports: [MonitoringService],
})
export class MonitoringModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(MonitoringMiddleware).forRoutes('*');
  }
}