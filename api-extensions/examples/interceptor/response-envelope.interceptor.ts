import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NestInterceptor,
  RequestTimeoutException,
} from '@nestjs/common';
import { Observable, throwError, TimeoutError } from 'rxjs';
import { catchError, map, tap, timeout } from 'rxjs/operators';

/**
 * Example interceptor showing the three most common uses of RxJS operators
 * inside a NestJS interceptor:
 *
 *  1. Response transformation  -> `map`
 *  2. Logging / timing         -> `tap`
 *  3. Error handling           -> `timeout` + `catchError`
 *
 * Code before `next.handle()` runs BEFORE the route handler;
 * operators piped onto the returned Observable run AFTER it.
 */

export interface ResponseEnvelope<T> {
  success: true;
  data: T;
  meta: {
    timestamp: string;
    path: string;
    durationMs: number;
  };
}

interface ExampleRequest {
  method?: string;
  url?: string;
  originalUrl?: string;
}

export const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

@Injectable()
export class ResponseEnvelopeInterceptor<T = unknown>
  implements NestInterceptor<T, ResponseEnvelope<T>>
{
  private readonly logger = new Logger(ResponseEnvelopeInterceptor.name);

  constructor(private readonly timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS) {}

  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ResponseEnvelope<T>> {
    // --- before the handler -------------------------------------------------
    const request = context.switchToHttp().getRequest<ExampleRequest>();
    const method = request.method ?? 'UNKNOWN';
    const path = request.originalUrl ?? request.url ?? '';
    const handler = `${context.getClass().name}.${context.getHandler().name}`;
    const startedAt = Date.now();

    this.logger.debug(`--> ${method} ${path} (${handler})`);

    // --- after the handler --------------------------------------------------
    return next.handle().pipe(
      // Fail fast if the handler takes too long.
      timeout(this.timeoutMs),

      // Logging: side effects only, the value passes through untouched.
      tap({
        next: () => this.logger.log(`<-- ${method} ${path} ${Date.now() - startedAt}ms`),
        error: (err: unknown) =>
          this.logger.warn(
            `<-- ${method} ${path} failed after ${Date.now() - startedAt}ms: ${
              err instanceof Error ? err.message : String(err)
            }`,
          ),
      }),

      // Response transformation: wrap the handler result in a standard envelope.
      map(
        (data): ResponseEnvelope<T> => ({
          success: true,
          data,
          meta: {
            timestamp: new Date().toISOString(),
            path,
            durationMs: Date.now() - startedAt,
          },
        }),
      ),

      // Error handling: map unknown/low-level errors to proper HTTP exceptions.
      catchError((err: unknown) => throwError(() => this.toHttpException(err))),
    );
  }

  private toHttpException(err: unknown): HttpException {
    if (err instanceof HttpException) {
      // Already an HTTP error - let Nest's exception filters handle it as-is.
      return err;
    }
    if (err instanceof TimeoutError) {
      return new RequestTimeoutException(`Request exceeded ${this.timeoutMs}ms`);
    }

    this.logger.error(
      'Unhandled error in request pipeline',
      err instanceof Error ? err.stack : String(err),
    );
    // Never leak internal error details to the client.
    return new InternalServerErrorException('An unexpected error occurred');
  }
}
