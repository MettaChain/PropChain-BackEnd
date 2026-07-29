import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { randomUUID } from 'crypto';

@Injectable()
export class TraceInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TraceInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const traceId = randomUUID();
    const startTime = Date.now();

    const className = context.getClass().name;
    const handlerName = context.getHandler().name;

    request.headers['x-trace-id'] = traceId;
    request.traceId = traceId;

    this.logger.log(`[${traceId}] ${className}.${handlerName} - started`);

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          const response = context.switchToHttp().getResponse();
          response.setHeader('X-Trace-Id', traceId);
          this.logger.log(`[${traceId}] ${className}.${handlerName} - completed (${duration}ms)`);
        },
        error: (error) => {
          const duration = Date.now() - startTime;
          this.logger.error(
            `[${traceId}] ${className}.${handlerName} - failed (${duration}ms): ${error.message}`,
          );
        },
      }),
    );
  }
}
