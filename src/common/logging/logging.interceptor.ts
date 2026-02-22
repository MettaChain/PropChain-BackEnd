import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { StructuredLoggerService } from './logger.service';
import { MetricsService } from './metrics.service';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(
    private readonly logger: StructuredLoggerService,
    private readonly metrics: MetricsService,
  ) {
    this.logger.setContext('HTTP');
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, headers, body } = request;
    const requestStartTime = Date.now();

    this.logger.logRequest(method, url, {
      userAgent: headers['user-agent'],
      body,
    });

    return next.handle().pipe(
      tap({
        next: () => {
          const response = context.switchToHttp().getResponse();
          const { statusCode } = response;
          const duration = Date.now() - requestStartTime;

          this.logger.logResponse(method, url, statusCode, duration);
          this.metrics.recordHttpRequest(method, url, statusCode, duration);
        },
        error: (error: any) => {
          const duration = Date.now() - requestStartTime;
          this.logger.error(`${method} ${url} Failed in ${duration}ms`, error.stack, {
            error,
          });
          this.metrics.recordHttpRequest(method, url, 500, duration);
          this.metrics.recordError('http_request', {
            method,
            url,
          });
        },
      }),
    );
  }
}
