import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

interface SlowRequest {
  method?: string;
  originalUrl?: string;
  url?: string;
  ip?: string;
  authUser?: { sub?: string; id?: string };
}

interface SlowResponse {
  statusCode?: number;
}

@Injectable()
export class SlowQueryDetectionInterceptor implements NestInterceptor {
  private readonly logger = new Logger(SlowQueryDetectionInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const startedAt = Date.now();
    const request = context.switchToHttp().getRequest<SlowRequest>();
    const response = context.switchToHttp().getResponse<SlowResponse>();
    const threshold = this.thresholdMs();

    const report = (error?: unknown) => {
      const duration = Date.now() - startedAt;
      if (duration < threshold) return;

      this.logger.warn(
        `Slow request detected: ${request.method ?? 'UNKNOWN'} ${request.originalUrl ?? request.url ?? ''} ` +
          `duration=${duration}ms threshold=${threshold}ms status=${response.statusCode ?? (error ? 500 : 200)} ` +
          `user=${request.authUser?.sub ?? request.authUser?.id ?? 'anonymous'} ip=${request.ip ?? 'unknown'}`,
      );
    };

    return next.handle().pipe(
      tap({
        next: () => report(),
        error: (error) => report(error),
      }),
    );
  }

  private thresholdMs(): number {
    const configured = Number(
      process.env.SLOW_QUERY_THRESHOLD_MS ?? process.env.TRACE_SLOW_THRESHOLD_MS,
    );
    return Number.isFinite(configured) && configured > 0 ? configured : 2000;
  }
}
