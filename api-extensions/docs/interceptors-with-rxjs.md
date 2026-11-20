# Building Interceptors with RxJS (`api-extensions/interceptors/`)

> **Scope.** This guide is for extensions that live under `api-extensions/`. Every
> example file path below is inside that folder. Files in `src/`, `prisma/`,
> `test/`, and the repository root are **read-only references**: they show the
> house style but must never be edited from an extension issue. Imports from
> `src/` in the examples are references to existing providers, not new files.

Nest interceptors sit between the router and the route handler. They can inspect
the request **before** the handler runs, and transform, observe, or replace the
handler's result **after** it runs. They are the right tool for response
envelopes, timing, audit logging, caching, and error enrichment — anything that
needs to see both sides of the handler call.

The existing implementations to study are
`src/common/interceptors/response-format.interceptor.ts` (envelope + error
normalisation with `map`/`catchError`), `src/tracing/trace.interceptor.ts`
(trace IDs + timing with `tap`), and `src/analytics/analytics.interceptor.ts`
(usage recording on both success and failure paths).

## 1. The contract: `NestInterceptor` and `CallHandler`

```ts
// api-extensions/interceptors/example-skeleton.interceptor.ts
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class ExampleSkeletonInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // Runs BEFORE the controller handler.
    const startedAt = Date.now();
    void startedAt;

    // next.handle() returns an Observable that emits the handler's result.
    return next.handle(); // No operator = pass-through.
  }
}
```

| Object | What it gives you | Typical calls |
| --- | --- | --- |
| `ExecutionContext` | The execution context of the current request | `context.switchToHttp().getRequest()` / `.getResponse()`, `context.getClass()`, `context.getHandler()`, `context.getArgs()` |
| `CallHandler` | The next link in the chain | `next.handle()` — returns `Observable<T>`, the handler's eventual value |
| `Observable<T>` | The handler result stream | `.pipe(...)` with RxJS operators |

**Two phases matter.** Code you write *before* `next.handle()` executes when the
request enters the interceptor. Code inside operator callbacks executes on
emission, i.e. after the handler produced a value (or failed). This is why an
interceptor can time a request, add headers, mutate the request object, and
still reshape the response in one place.

Nest subscribes to the returned observable for you. **Never call `.subscribe()`
inside an interceptor** — that creates a second execution path and breaks
backpressure/error propagation.

## 2. RxJS operator cheat sheet

| Operator / helper | Use in an interceptor | Watch out for |
| --- | --- | --- |
| `map(fn)` | Rewrite the success value: wrap an envelope, drop fields, rename keys | Must return a value; throwing inside turns into an error notification |
| `tap({ next, error, complete })` | Side effects only: metrics, logging, headers | Do not use it to change the emitted value |
| `catchError(fn)` | Log/enrich errors, fall back to a value, or rethrow | Returning a value **swallows** the error; HTTP will usually be 200 unless you set the status explicitly |
| `finalize(fn)` | Cleanup/timing that must happen on success, failure, or unsubscribe | It runs once per subscription teardown — keep it free of value-dependent logic |
| `throwError(() => err)` | Rethrow from `catchError` using the factory form | Passing the error directly (`throwError(err)`) is deprecated and eagerly created |
| `of(value)` | Test double for a successful `CallHandler` | Illustrative tests only; see section 8 |

Rules of thumb:

- For ordinary HTTP handlers the observable emits **once** and completes.
  Server-sent events and streaming endpoints can emit many times; `map` then
  runs per chunk, and `finalize` still runs once at teardown.
- Operator order is the pipeline order. A `tap` placed *before* `map` observes
  the raw handler value; placed *after*, it observes the transformed one.
- Imports from `rxjs/operators` are used throughout this repository; the
  standalone `rxjs` imports work equally well in extensions.
- Keep logging side effects in `tap`/`finalize` and keep transformations in
  `map`; mixing them makes interceptors hard to test.

## 3. Response transformation pattern

`src/common/interceptors/response-format.interceptor.ts` wraps raw controller
results into `{ success, data, meta, timestamp }` and skips responses that are
already enveloped. An extension equivalent belongs in
`api-extensions/interceptors/api-envelope.interceptor.ts`:

```ts
// api-extensions/interceptors/api-envelope.interceptor.ts
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiEnvelope<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
  timestamp: string;
}

@Injectable()
export class ApiEnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const timestamp = new Date().toISOString();

    return next.handle().pipe(
      map((value) => {
        // Idempotency: never double-wrap a handler that already has an envelope.
        if (value && typeof value === 'object' && 'success' in value) {
          return value;
        }

        // Preserve the { data, meta } shape used by paginated listings.
        if (
          value &&
          typeof value === 'object' &&
          'data' in value &&
          'meta' in value
        ) {
          const { data, meta } = value as { data: unknown; meta: Record<string, unknown> };
          const envelope: ApiEnvelope<unknown> = { success: true, data, timestamp };
          if (meta) envelope.meta = meta;
          return envelope;
        }

        return { success: true, data: value, timestamp } as ApiEnvelope<unknown>;
      }),
    );
  }
}
```

Why this shape works:

- Handlers stay simple: they return domain objects, not framework envelopes.
- Re-applying the interceptor (global + controller-level) does not nest
  `{ data: { data: ... } }` because of the `'success' in value` guard.
- Pagination metadata from services such as the amenity listing in
  `api-extensions/modules/amenity-management/amenity-management.service.ts`
  survives unchanged.

## 4. Logging and audit pattern

`src/tracing/trace.interceptor.ts` uses `tap({ next, error })` around the stream;
`src/analytics/analytics.interceptor.ts` does the same while recording status
codes. The extension version should also use `finalize` so the audit record is
written exactly once, on both success and failure:

```ts
// api-extensions/interceptors/audit-log.interceptor.ts
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { catchError, finalize, tap } from 'rxjs/operators';

export interface AuditSink {
  record(entry: {
    action: string;
    userId: string | null;
    statusCode: number;
    durationMs: number;
    outcome: 'success' | 'error';
  }): void;
}

interface AuditedRequest {
  method?: string;
  originalUrl?: string;
  headers?: Record<string, string | string[] | undefined>;
  authUser?: { sub?: string };
}

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditLogInterceptor.name);

  constructor(private readonly sink: AuditSink) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const startedAt = Date.now();
    const request = context.switchToHttp().getRequest<AuditedRequest>();
    const response = context.switchToHttp().getResponse<{ statusCode?: number }>();
    const action = `${request.method ?? 'UNKNOWN'} ${request.originalUrl ?? ''}`;
    const userId = request.authUser?.sub ?? null;

    let outcome: 'success' | 'error' = 'success';
    let statusCode = 200;

    return next.handle().pipe(
      tap({
        next: () => {
          statusCode = response.statusCode ?? 200;
        },
        error: () => {
          outcome = 'error';
          statusCode = response.statusCode ?? 500;
        },
      }),
      catchError((error: unknown) => {
        this.logger.warn(`${action} failed: ${this.message(error)}`);
        throw error; // Re-throw: exception filters own the HTTP response.
      }),
      finalize(() => {
        this.sink.record({
          action,
          userId,
          statusCode,
          durationMs: Date.now() - startedAt,
          outcome,
        });
      }),
    );
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : 'unknown error';
  }
}
```

The `tap` callbacks only capture state; `finalize` performs the write. That
guarantees one audit row whether the handler succeeds, throws, or the client
disconnects mid-stream. If you also write a success log in `tap`, you will
double-count.

## 5. Error handling in interceptors

- **Preserve `HttpException`s.** Exception filters in the host application
  (registered globally in `src/app.module.ts`) translate them into the canonical
  error envelope. Converting an exception into a plain object inside
  `catchError` prevents that translation.
- **Enrich, then rethrow.** Log the request ID (propagated by the middleware in
  `src/common/request-id.middleware.ts`), add tags to your observability tool,
  then `return throwError(() => error)`.
- **Set the status if you swallow.** Only emit a fallback value from
  `catchError` when you intentionally want a 200 response — for example a
  stale-cache fallback. If you replace the error with an envelope, call
  `response.status(statusCode)` yourself.
- **`finalize` sees errors too.** Do not treat it as an "on success" hook.

```ts
// api-extensions/interceptors/request-context-error.interceptor.ts
import { CallHandler, ExecutionContext, HttpException, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

interface RequestWithId {
  headers?: Record<string, string | string[] | undefined>;
  authUser?: { sub?: string };
}

@Injectable()
export class RequestContextErrorInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RequestContextErrorInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestWithId>();
    const rawId = request.headers?.['x-request-id'];
    const requestId = Array.isArray(rawId) ? rawId[0] : rawId;

    return next.handle().pipe(
      catchError((error: unknown) => {
        const status = error instanceof HttpException ? error.getStatus() : 500;
        const user = request.authUser?.sub ?? 'anonymous';
        this.logger.warn(`[${requestId ?? 'no-id'}] ${user} failed with ${status}`);
        return throwError(() => error);
      }),
    );
  }
}
```

## 6. Registration: global, per-module, per-controller, per-route

| Scope | How | When to use |
| --- | --- | --- |
| Global (bootstrap) | `app.useGlobalInterceptors(app.get(X))` | Cross-cutting behaviour for every route (envelope, tracing) |
| Global (DI-friendly) | `{ provide: APP_INTERCEPTOR, useClass: X }` in a module's `providers` | When the interceptor has injected dependencies and you want Nest to manage them |
| Controller | `@UseInterceptors(X)` on the class | Only that controller's routes |
| Route | `@UseInterceptors(X)` on the handler | One sensitive endpoint (large-body check, audit) |

Global interceptors are resolved from the DI container by `app.get()` in the
host bootstrap. Do **not** use `useGlobalInterceptors(new MyInterceptor())`
when the interceptor injects services — that instance bypasses DI, so its
constructor dependencies are `undefined`. The pattern used by the host app is
illustrated here:

```ts
// api-extensions/examples/register-interceptors.ts
import { INestApplication } from '@nestjs/common';
import { ApiEnvelopeInterceptor } from '../interceptors/api-envelope.interceptor';
import { RequestContextErrorInterceptor } from '../interceptors/request-context-error.interceptor';

export function registerExtensionInterceptors(app: INestApplication): void {
  // Instances resolved through Nest so their dependencies are injected.
  app.useGlobalInterceptors(
    app.get(ApiEnvelopeInterceptor),
    app.get(RequestContextErrorInterceptor),
  );
}
```

For module-scoped DI registration and controller/route usage:

```ts
// api-extensions/modules/property-insights/property-insights.module.ts
import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PropertyInsightsController } from './property-insights.controller';
import { PropertyInsightsService } from './property-insights.service';
import { ApiEnvelopeInterceptor } from '../../interceptors/api-envelope.interceptor';

@Module({
  controllers: [PropertyInsightsController],
  providers: [
    PropertyInsightsService,
    { provide: APP_INTERCEPTOR, useClass: ApiEnvelopeInterceptor },
  ],
})
export class PropertyInsightsModule {}
```

```ts
// api-extensions/modules/property-insights/property-insights.controller.ts
import { Controller, Get, Param, UseInterceptors } from '@nestjs/common';
import { AuditAction, AuditedEnvelopeInterceptor } from '../../interceptors/audited-envelope.interceptor';
import { PropertyInsightsService } from './property-insights.service';

@Controller('api/extensions/property-insights')
@UseInterceptors(AuditedEnvelopeInterceptor)
export class PropertyInsightsController {
  constructor(private readonly service: PropertyInsightsService) {}

  @Get('estimate/:id')
  @AuditAction('property.estimate.read')
  estimate(@Param('id') id: string) {
    return this.service.estimate(id);
  }
}
```

> **Ordering.** Global interceptors run before controller interceptors, which
> run before route interceptors. The *first* interceptor entered is the outermost
> one in the observable chain, so its `map` sees the final value produced by
> inner interceptors. Put timing/audit outermost and value transformation last
> in the registration order if you want the envelope to include all nested
> changes.

## 7. Complete example

This single interceptor combines all four operators, a metadata decorator, and
DI. It is the pattern to copy when an extension needs a self-contained, testable
cross-cutting concern.

```ts
// api-extensions/interceptors/audited-envelope.interceptor.ts
import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, of, throwError } from 'rxjs';
import { catchError, finalize, map, tap } from 'rxjs/operators';
import { AuditSink } from './audit-log.interceptor';

export const AUDIT_ACTION_KEY = 'extension-audit-action';

export const AuditAction = (action: string) => SetMetadata(AUDIT_ACTION_KEY, action);

export interface ExtensionEnvelope<T> {
  success: true;
  data: T;
  traceId: string | null;
  timestamp: string;
}

interface ExtensionRequest {
  headers?: Record<string, string | string[] | undefined>;
  authUser?: { sub?: string };
  method?: string;
  originalUrl?: string;
  traceId?: string;
}

@Injectable()
export class AuditedEnvelopeInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly sink: AuditSink,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const startedAt = Date.now();
    const request = context.switchToHttp().getRequest<ExtensionRequest>();
    const traceId =
      request.traceId ??
      (Array.isArray(request.headers?.['x-request-id'])
        ? request.headers?.['x-request-id'][0]
        : request.headers?.['x-request-id']) ??
      null;
    const action =
      this.reflector.getAllAndOverride<string>(AUDIT_ACTION_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? `${request.method ?? 'UNKNOWN'} ${request.originalUrl ?? ''}`;
    const userId = request.authUser?.sub ?? null;

    let outcome: 'success' | 'error' = 'success';

    return next.handle().pipe(
      // 1. Transform the handler's value into the standard envelope.
      map((value) => {
        if (value && typeof value === 'object' && 'success' in value) return value;
        const envelope: ExtensionEnvelope<unknown> = {
          success: true,
          data: value,
          traceId,
          timestamp: new Date().toISOString(),
        };
        return envelope;
      }),
      // 2. Observe the post-map value and remember the outcome.
      tap({
        next: () => {
          outcome = 'success';
        },
        error: () => {
          outcome = 'error';
        },
      }),
      // 3. Enrich/log errors without swallowing HttpExceptions.
      catchError((error: unknown) => {
        const status = error instanceof HttpException ? error.getStatus() : 500;
        this.sink.record({
          action,
          userId,
          statusCode: status,
          durationMs: Date.now() - startedAt,
          outcome: 'error',
        });
        return throwError(() => error);
      }),
      // 4. Finalise cleanup/telemetry; guarded to avoid double recording.
      finalize(() => {
        if (outcome === 'success') {
          this.sink.record({
            action,
            userId,
            statusCode: 200,
            durationMs: Date.now() - startedAt,
            outcome: 'success',
          });
        }
      }),
    );
  }
}

// Illustrative usage on a route:
//
// @Get(':id')
// @AuditAction('property.estimate.read')
// getEstimate(@Param('id') id: string) { return this.service.estimate(id); }
```

Note the guard in `finalize`: `catchError` already recorded the failure, so the
finalizer only records successful streams. An alternative is to record in
`finalize` only and capture `statusCode` in `catchError`; pick one owner for the
write.

## 8. Illustrative test snippet

Unit-test interceptors directly with a mocked `ExecutionContext`, an
`of(...)`/`throwError(...)` `CallHandler`, and `firstValueFrom`. This file is
**illustrative only** — it is not created by this guide.

```ts
// api-extensions/tests/unit/audited-envelope.interceptor.spec.ts
import { CallHandler, ExecutionContext, HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { firstValueFrom, of, throwError } from 'rxjs';
import {
  AuditedEnvelopeInterceptor,
  AUDIT_ACTION_KEY,
} from '../../interceptors/audited-envelope.interceptor';
import { AuditSink } from '../../interceptors/audit-log.interceptor';

describe('AuditedEnvelopeInterceptor', () => {
  const sink: jest.Mocked<AuditSink> = { record: jest.fn() };
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue('estimate.read') };
  const response = { statusCode: 200 };
  const request = {
    headers: { 'x-request-id': 'req-1' },
    authUser: { sub: 'user-1' },
    method: 'GET',
    originalUrl: '/api/extensions/estimates/1',
  };
  const context = {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
    getHandler: () => () => undefined,
    getClass: () => class TestController {},
  } as unknown as ExecutionContext;

  let interceptor: AuditedEnvelopeInterceptor;

  beforeEach(() => {
    jest.clearAllMocks();
    interceptor = new AuditedEnvelopeInterceptor(
      reflector as unknown as Reflector,
      sink,
    );
  });

  it('wraps a raw handler value in the envelope', async () => {
    const next: CallHandler = { handle: () => of({ id: 'p1', estimate: 100 }) };

    const result = await firstValueFrom(interceptor.intercept(context, next));

    expect(result).toMatchObject({
      success: true,
      traceId: 'req-1',
      data: { id: 'p1', estimate: 100 },
    });
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
      AUDIT_ACTION_KEY,
      expect.any(Array),
    );
    expect(sink.record).toHaveBeenCalledTimes(1);
    expect(sink.record).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'success' }));
  });

  it('rethrows HttpExceptions after recording the failure', async () => {
    const error = new HttpException('not found', 404);
    const next: CallHandler = { handle: () => throwError(() => error) };

    await expect(firstValueFrom(interceptor.intercept(context, next))).rejects.toBe(error);
    expect(sink.record).toHaveBeenCalledTimes(1);
    expect(sink.record).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });
});
```

## 9. Checklist before submitting an extension interceptor

- [ ] Provider is `@Injectable()` and registered once (avoid duplicate global + controller registration unless idempotent).
- [ ] `next.handle()` is returned, never subscribed to manually.
- [ ] `catchError` rethrows `HttpException` or sets the status explicitly.
- [ ] `finalize`/`tap` each own exactly one audit write.
- [ ] Transformation is idempotent for already-enveloped responses.
- [ ] Constructor dependencies are injected through the container (`app.get()` or `APP_INTERCEPTOR`).
- [ ] Tests use mocked `ExecutionContext`/`CallHandler` and cover success + error.
- [ ] Every new file lives under `api-extensions/`.

## References in the host codebase (read-only)

- `src/common/interceptors/response-format.interceptor.ts` — envelope and error normalisation with `map`/`catchError`.
- `src/tracing/trace.interceptor.ts` — trace ID generation, `tap({ next, error })`, sampling, slow-request threshold.
- `src/analytics/analytics.interceptor.ts` — recording success and error status codes with `tap` + `catchError`.
- `api-extensions/interceptors/request-sanitization.interceptor.ts`, `request-body-size-limit.interceptor.ts`, `slow-query-detection.interceptor.ts` — local house style for metadata-driven and logging interceptors.
