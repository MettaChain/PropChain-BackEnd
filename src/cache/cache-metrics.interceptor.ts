// @ts-nocheck

/**
 * Cache Metrics Interceptor
 * Automatically tracks cache performance metrics
 *
 * DI Contract:
 * This interceptor must be registered via app.useGlobalInterceptors() in main.ts
 * using the already-resolved singleton from the DI container:
 *
 *   const cacheMetricsInterceptor = app.get(CacheMetricsInterceptor);
 *   app.useGlobalInterceptors(cacheMetricsInterceptor);
 *
 * WHY: The CacheMonitoringService it depends on is provided at the CacheModule
 * level. If @UseInterceptors(CacheMetricsInterceptor) were used on a controller
 * instead, NestJS would instantiate a NEW interceptor instance from a sub-module
 * injector, which would receive a DIFFERENT CacheMonitoringService singleton.
 * As a result, metric counters would not reflect server-wide values, the stats
 * endpoint would be unreliable, and alerting (low hit-rate / high response-time)
 * would break silently.
 *
 * Any refactoring that changes how this interceptor is registered MUST verify
 * that CacheMonitoringService remains a true application-wide singleton.
 */

import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { CacheMonitoringService } from './cache-monitoring.service';

@Injectable()
export class CacheMetricsInterceptor implements NestInterceptor {
  // CacheMonitoringService is expected to be a singleton provided by the CacheModule
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
