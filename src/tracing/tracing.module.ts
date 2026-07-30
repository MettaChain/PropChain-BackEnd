import { Module, Global } from '@nestjs/common';
import { TraceInterceptor } from './trace.interceptor';

@Global()
@Module({
  providers: [TraceInterceptor],
  exports: [TraceInterceptor],
})
export class TracingModule {}
