import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module';
import { ListingsController } from './listings.controller';
import { ListingsService } from './listings.service';
import { TraceInterceptor } from '../tracing/trace.interceptor';

@Module({
  imports: [PrismaModule],
  controllers: [ListingsController],
  providers: [ListingsService, TraceInterceptor],
  exports: [ListingsService],
})
export class ListingsModule {}
