import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module';
import { InvestmentsController } from './investments.controller';
import { InvestmentsService } from './investments.service';
import { TraceInterceptor } from '../tracing/trace.interceptor';

@Module({
  imports: [PrismaModule],
  controllers: [InvestmentsController],
  providers: [InvestmentsService, TraceInterceptor],
  exports: [InvestmentsService],
})
export class InvestmentsModule {}
