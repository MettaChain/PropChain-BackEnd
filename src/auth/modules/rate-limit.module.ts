import { Global, Module } from '@nestjs/common';
import { RateLimitService } from '../rate-limit.service';
import { RateLimitGuard } from '../guards/rate-limit.guard';
import { RateLimitAdminController } from '../controllers/rate-limit-admin.controller';
import { RateLimitHeadersInterceptor } from '../interceptors/rate-limit-headers.interceptor';

@Global()
@Module({
  providers: [RateLimitService, RateLimitGuard, RateLimitHeadersInterceptor],
  controllers: [RateLimitAdminController],
  exports: [RateLimitService, RateLimitGuard, RateLimitHeadersInterceptor],
})
export class RateLimitModule {}
