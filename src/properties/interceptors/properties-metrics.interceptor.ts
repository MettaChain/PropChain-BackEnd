import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import {
  propertiesOutcomeForStatus,
  propertiesRequestDurationSeconds,
  propertiesRequestsTotal,
} from '../properties-metrics';

/** Records `properties_requests_total` and `properties_request_duration_seconds` for each handler call. */
@Injectable()
export class PropertiesMetricsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const operation = context.getHandler().name;
    const end = propertiesRequestDurationSeconds.startTimer({ operation });

    const record = (status: number): void => {
      end();
      propertiesRequestsTotal.inc({ operation, outcome: propertiesOutcomeForStatus(status) });
    };

    return next.handle().pipe(
      tap({
        next: () => record(context.switchToHttp().getResponse().statusCode ?? 200),
        error: (err: { status?: number; getStatus?: () => number }) =>
          record(typeof err?.getStatus === 'function' ? err.getStatus() : (err?.status ?? 500)),
      }),
    );
  }
}
