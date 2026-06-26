import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { trace, SpanStatusCode } from '@opentelemetry/api';

@Injectable()
export class TraceInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const method = request.method;
    const url = request.route?.path || request.url;
    const spanName = `${method} ${url}`;

    const tracer = trace.getTracer('propchain-backend');
    const span = tracer.startSpan(spanName, {
      attributes: {
        'http.method': method,
        'http.url': url,
        'http.host': request.headers?.host || 'unknown',
      },
    });

    return next.handle().pipe(
      tap({
        next: () => {
          span.setAttribute('http.status_code', 200);
          span.setStatus({ code: SpanStatusCode.OK });
          span.end();
        },
        error: (err) => {
          span.setAttribute('http.status_code', err.status || 500);
          span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
          span.recordException(err);
          span.end();
        },
      }),
    );
  }
}
