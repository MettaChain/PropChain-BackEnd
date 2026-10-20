import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import {
  listingOutcomeForStatus,
  listingResponseDurationSeconds,
  listingResultsReturned,
  ListingSurface,
  listingsServedTotal,
} from '../listings-metrics';

/**
 * Records the listing metrics for the two public listing routes.
 *
 * The surface is derived from the request path rather than from the handler
 * name, so adding a handler stays cheap and the label set cannot drift.
 */
@Injectable()
export class ListingsMetricsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const surface: ListingSurface = request.path?.endsWith('/search') ? 'search' : 'list';
    const end = listingResponseDurationSeconds.startTimer({ surface });

    const record = (status: number, body: unknown): void => {
      end();
      listingsServedTotal.inc({ surface, outcome: listingOutcomeForStatus(status) });
      // Only successful reads have a meaningful row count to report.
      if (status < 400) {
        const count = Array.isArray(body)
          ? body.length
          : typeof (body as { items?: unknown[] })?.items?.length === 'number'
            ? ((body as { items: unknown[] }).items as unknown[]).length
            : undefined;
        if (count !== undefined) listingResultsReturned.observe({ surface }, count);
      }
    };

    return next.handle().pipe(
      tap({
        next: (body) => record(context.switchToHttp().getResponse().statusCode ?? 200, body),
        error: (err: { status?: number; getStatus?: () => number }) =>
          record(typeof err?.getStatus === 'function' ? err.getStatus() : (err?.status ?? 500), undefined),
      }),
    );
  }
}
