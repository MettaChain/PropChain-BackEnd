import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AnalyticsService } from './analytics.service';

@Injectable()
export class AnalyticsInterceptor implements NestInterceptor {
  constructor(private readonly analytics: AnalyticsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    const start = Date.now();

    return next.handle().pipe(
      tap(() => {
        this.analytics.record({
          endpoint: req.path,
          method: req.method,
          statusCode: res.statusCode,
          responseTime: Date.now() - start,
        });
      }),
    );
  }
}
