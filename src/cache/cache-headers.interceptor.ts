import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { CacheMonitoringService } from './cache-monitoring.service';

const IMAGE_CACHE_DURATIONS: Record<string, number> = {
  'image/avif': 86400 * 30,
  'image/webp': 86400 * 7,
  'image/jpeg': 3600,
  'image/png': 3600,
  'image/gif': 3600,
};

/**
 * Cache Headers Interceptor
 * Adds cache-related headers to responses including error status
 */
@Injectable()
export class CacheHeadersInterceptor implements NestInterceptor {
  constructor(private cacheMonitoringService: CacheMonitoringService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const res = context.switchToHttp().getResponse();
    const req = context.switchToHttp().getRequest();
    const start = Date.now();

    return next.handle().pipe(
      tap(() => {
        const responseTime = Date.now() - start;
        res.setHeader('X-Cache-Time', `${responseTime}ms`);

        // Add cache status header based on monitoring service metrics
        const metrics = this.cacheMonitoringService.getMetrics();
        const errorRate = metrics.totalRequests > 0 
          ? (metrics.errors / metrics.totalRequests) * 100 
          : 0;

        // Set cache status header
        if (errorRate > 5) {
          res.setHeader('X-Cache', 'error');
        } else if (metrics.hitRate > 50) {
          res.setHeader('X-Cache', 'hit');
        } else {
          res.setHeader('X-Cache', 'miss');
        }

        // Add cache health metrics as headers
        res.setHeader('X-Cache-Hit-Rate', `${metrics.hitRate.toFixed(2)}%`);
        res.setHeader('X-Cache-Error-Rate', `${errorRate.toFixed(2)}%`);

        const contentType = res.getHeader('content-type') as string | undefined;
        const isImageResponse =
          contentType?.startsWith('image/') || req.path?.includes('/uploads/');

        if (isImageResponse) {
          const format = contentType?.split(';')[0]?.trim() || 'image/jpeg';
          const maxAge = IMAGE_CACHE_DURATIONS[format] || 3600;
          res.setHeader('Cache-Control', `public, max-age=${maxAge}`);
          res.setHeader('Vary', 'Accept');
        } else {
          res.setHeader('Cache-Control', 'public, max-age=60');
        }
      }),
    );
  }
}
