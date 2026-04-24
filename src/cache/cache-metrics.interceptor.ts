/**
 * Cache Metrics Interceptor
 * Automatically tracks cache performance metrics
 */

import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { CacheMonitoringService } from './cache-monitoring.service';

@Injectable()
export class CacheMetricsInterceptor implements NestInterceptor {
  constructor(private cacheMonitoringService: CacheMonitoringService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const startTime = Date.now();

    return next.handle().pipe(
      tap(() => {
        const responseTime = Date.now() - startTime;
        this.cacheMonitoringService.recordResponseTime(responseTime);
      }),
    );
  }
}
