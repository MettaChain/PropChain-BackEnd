# Writing Custom Middleware in NestJS (`api-extensions/modules/`)

> **Scope.** All example files below live under `api-extensions/`. Files in
> `src/`, `prisma/`, `test/`, and the repository root are read-only references —
> they illustrate the house style but must not be changed by an extension issue.
> Imports from `src/` refer to existing code; they do not create new files.

Middleware is the earliest Nest/Express layer in the request pipeline: it runs
**before** guards, interceptors, pipes, and the route handler. Use it for
request-scoped plumbing that does not need the handler result — request IDs,
header normalisation, CORS preflight handling, tenant/version detection, and
correlation context.

The host implementations to study are
`src/common/request-id.middleware.ts` (`AsyncLocalStorage` propagation) and
`src/versioning/version.middleware.ts` (extracting a version from path/headers,
validating it, and storing it on the request). Note that the host applies
`RequestIdMiddleware` in `AppModule.configure()` with `forRoutes('*')`.

## 1. The `NestMiddleware` contract

```ts
// api-extensions/modules/request-context/example-skeleton.middleware.ts
import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

@Injectable()
export class ExampleSkeletonMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    // Pre-handler work only: req/res are the raw Express objects.
    next(); // Hand control to the next middleware / router.
  }
}
```

| Parameter | Type | What you can do with it |
| --- | --- | --- |
| `req` | `express.Request` | Read `req.headers`, `req.method`, `req.path`, attach custom fields (e.g. `req.apiVersion`) |
| `res` | `express.Response` | `res.setHeader(...)`, `res.removeHeader(...)`, or end the request (`res.status(204).end()`) |
| `next` | `express.NextFunction` | Continue the chain with `next()`, or pass an error with `next(error)` |

Rules:

- Call `next()` **exactly once**, or explicitly end the response. Forgetting it
  leaves the request hanging; calling it twice can run handlers twice.
- Any value needed later in the pipeline should be attached to `req` (with a
  typed extension interface) or placed in `AsyncLocalStorage`.
- Synchronous throws are routed to Nest's error handling; for failures in
  asynchronous callbacks use `next(error)` because the exception layer is no
  longer in the synchronous call stack.
- Middleware cannot see or transform the handler's return value. For that, use
  an interceptor (see `api-extensions/docs/interceptors-with-rxjs.md`).

## 2. `MiddlewareConsumer.configure()`

Middleware is registered by a module that implements `NestModule`:

```ts
// api-extensions/modules/request-context/example-skeleton.module.ts
import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ExampleSkeletonMiddleware } from './example-skeleton.middleware';

@Module({})
export class ExampleSkeletonModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(ExampleSkeletonMiddleware)
      .exclude({ path: 'health', method: RequestMethod.ALL })
      .forRoutes(
        { path: 'api/extensions/*', method: RequestMethod.ALL },
      );
  }
}
```

Key points:

- `apply(...)` accepts one or more middleware classes; they run in the order
  listed. `forRoutes(...)` accepts path strings, path objects with a
  `RequestMethod`, controllers, or wildcard paths.
- `exclude(...)` removes routes from the middleware. Put it between `apply()`
  and `forRoutes()`.
- `configure()` applies to routes declared in **that** module. To cover the
  whole app, apply the middleware in the root module (as the host does) or use
  `app.use(...)` in the bootstrap:

```ts
// api-extensions/examples/register-middleware.ts
import { INestApplication } from '@nestjs/common';
import { RequestContextMiddleware } from '../modules/request-context/request-context.middleware';

export function registerExtensionMiddleware(app: INestApplication): void {
  // DI-managed instance: constructor dependencies are injected.
  const contextMiddleware = app.get(RequestContextMiddleware);
  app.use(contextMiddleware.use.bind(contextMiddleware));
}
```

Prefer `configure()` for route-scoped middleware: `app.use()` is global and
with no path prefix it also wraps unrelated routes. If a middleware has
injected dependencies, resolve it from the container before passing it to
`app.use()` — passing the class itself loses DI.

## 3. Request ID propagation with `AsyncLocalStorage`

`src/common/request-id.middleware.ts` stores a per-request `Map` in an
`AsyncLocalStorage` and passes `next()` **inside** `storage.run(...)`, so every
asynchronous continuation of that request can read the ID without threading it
through function signatures.

The extension version should own its own store to avoid coupling to host
internals:

```ts
// api-extensions/modules/request-context/request-context.storage.ts
import { AsyncLocalStorage } from 'async_hooks';

export interface ExtensionRequestContext {
  requestId: string;
  userId?: string;
}

export const extensionRequestStorage = new AsyncLocalStorage<ExtensionRequestContext>();

export function currentRequestContext(): ExtensionRequestContext | undefined {
  return extensionRequestStorage.getStore();
}

export function currentRequestId(): string | undefined {
  return extensionRequestStorage.getStore()?.requestId;
}
```

```ts
// api-extensions/modules/request-context/request-context.middleware.ts
import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { extensionRequestStorage } from './request-context.storage';

export const REQUEST_ID_HEADER = 'X-Request-Id';
const MAX_HEADER_LENGTH = 128;

interface RequestWithUser extends Request {
  authUser?: { sub?: string };
}

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: RequestWithUser, res: Response, next: NextFunction): void {
    const forwarded = req.headers[REQUEST_ID_HEADER.toLowerCase()];
    // Never trust an unbounded client-supplied header as a log key.
    const candidate = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const requestId =
      candidate && /^[\w.:-]{1,128}$/.test(candidate) && candidate.length <= MAX_HEADER_LENGTH
        ? candidate
        : randomUUID();

    res.setHeader(REQUEST_ID_HEADER, requestId);

    const context = { requestId, userId: req.authUser?.sub };
    // Critical: next() must be invoked inside run() so downstream async work
    // inherits the store.
    extensionRequestStorage.run(context, () => next());
  }
}
```

Consumers can then be completely free of request parameters:

```ts
// api-extensions/services/audit-trail.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { currentRequestId } from '../modules/request-context/request-context.storage';

@Injectable()
export class AuditTrailService {
  private readonly logger = new Logger(AuditTrailService.name);

  recordEvent(event: string): void {
    this.logger.log(`[${currentRequestId() ?? 'no-id'}] ${event}`);
  }
}
```

Caveats:

- A fresh store per request means concurrent requests cannot leak IDs into each
  other — but only if you do not copy the store object between requests.
- Work spawned after the request has ended (detached timers, cron jobs) keeps
  the store of the request that spawned it; do not treat that as a guarantee of
  freshness.
- Store IDs and safe identifiers, not secrets or large objects.
- When a client supplies `X-Request-Id`, echo it back so logs line up across
  services; validate it first as shown above.

## 4. CORS and header manipulation

Use the host's `app.enableCors()` (see `src/main.ts`) for the global CORS policy.
Middleware is appropriate for *additional* headers, per-route overrides, and
explicit preflight handling. Never blindly reflect an arbitrary `Origin`; use
an allowlist.

```ts
// api-extensions/modules/request-context/security-headers.middleware.ts
import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

const ALLOWED_ORIGINS = new Set([
  'https://app.propchain.example',
  'https://admin.propchain.example',
]);

@Injectable()
export class SecurityHeadersMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const originHeader = req.headers.origin;
    const origin = Array.isArray(originHeader) ? originHeader[0] : originHeader;

    if (origin && ALLOWED_ORIGINS.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', this.withVary(res.getHeader('Vary'), 'Origin'));
    }

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.removeHeader('X-Powered-By');

    // Answer preflight here rather than letting it reach a controller.
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type,Authorization,X-Request-Id,API-Version',
      );
      res.status(204).end();
      return;
    }

    next();
  }

  private withVary(current: unknown, value: string): string {
    const existing = Array.isArray(current)
      ? current.map(String)
      : current
        ? [String(current)]
        : [];
    return Array.from(new Set([...existing, value])).join(', ');
  }
}
```

Header notes:

- Expression `req.headers` keys are lowercase; `res.setHeader` names are
  case-insensitive but should be written canonicalised for readability.
- `Vary: Origin` is required when the allowed origin is selected dynamically,
  otherwise shared caches can serve one origin's response to another.
- Combining this with a global CORS config can emit duplicate
  `Access-Control-Allow-Origin` headers. Choose one owner for each header.
- The versioning middleware in `src/versioning/version.middleware.ts` shows the
  complementary pattern: read from path, `API-Version` header and `Accept`,
  validate against a supported set, attach `req.apiVersion`, then `next()`.
  Extensions should copy that structure for their own version/tenant context
  rather than parsing headers in every controller.

## 5. Middleware vs interceptors

| Concern | Middleware | Interceptor |
| --- | --- | --- |
| Pipeline position | Before guards/interceptors/pipes | Around the route handler |
| Primitive | `use(req, res, next)` | `intercept(context, next)` returning `Observable` |
| Access to raw Express `req`/`res` | Direct | Via `context.switchToHttp()` |
| Can shape the response body | No (unless it ends the response itself) | Yes, with `map` |
| Can see handler errors | Only via `next(error)` (no result stream) | Yes, with `tap`/`catchError`/`finalize` |
| DI and metadata | Module `configure()`, constructor DI | `@Injectable()`, `APP_INTERCEPTOR`, `@UseInterceptors`, `Reflector` metadata |
| Typical use | Request IDs, security headers, CORS, tenant/version parsing | Envelopes, audit logs, timing, caching, error enrichment |

Rule of thumb: if the concern needs only the *request*, use middleware; if it
needs the *result* or the *error* of the handler, use an interceptor.

## 6. Complete example: a request-context module

Putting the pieces together in one module, with both middleware applied in a
deliberate order (context first, then headers):

```ts
// api-extensions/modules/request-context/request-context.module.ts
import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { RequestContextMiddleware } from './request-context.middleware';
import { SecurityHeadersMiddleware } from './security-headers.middleware';

@Module({})
export class RequestContextModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestContextMiddleware, SecurityHeadersMiddleware)
      .exclude({ path: 'api/extensions/health', method: RequestMethod.ALL })
      .forRoutes({ path: 'api/extensions/*', method: RequestMethod.ALL });
  }
}
```

Import this module where the extension endpoints are declared. If the endpoints
are in another module, register the middleware in that module's `configure()`
instead — middleware is module-scoped, not auto-global.

## 7. Illustrative test snippet

Unit-test middleware directly with fake Express objects. The assertions that
matter are: the header was set, `next()` ran, and the ID is visible **inside**
the `next()` callback (proving `run()` wraps it). This file is illustrative
only; it is not created by this guide.

```ts
// api-extensions/tests/unit/request-context.middleware.spec.ts
import { NextFunction, Request, Response } from 'express';
import { RequestContextMiddleware, REQUEST_ID_HEADER } from '../../modules/request-context/request-context.middleware';
import { SecurityHeadersMiddleware } from '../../modules/request-context/security-headers.middleware';
import { currentRequestId } from '../../modules/request-context/request-context.storage';

describe('RequestContextMiddleware', () => {
  const middleware = new RequestContextMiddleware();

  it('generates an ID and exposes it to downstream async work', () => {
    const req = { headers: {}, method: 'GET' } as unknown as Request;
    const res = { setHeader: jest.fn() } as unknown as Response;
    let observed: string | undefined;
    const next = jest.fn(() => {
      observed = currentRequestId();
    }) as unknown as NextFunction;

    middleware.use(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, expect.any(String));
    expect(next).toHaveBeenCalledTimes(1);
    expect(observed).toBeDefined();
  });

  it('reuses a valid client-supplied ID', () => {
    const req = { headers: { 'x-request-id': 'client-123' } } as unknown as Request;
    const res = { setHeader: jest.fn() } as unknown as Response;
    const next = jest.fn() as unknown as NextFunction;

    middleware.use(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, 'client-123');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('answers CORS preflight without calling the handler', () => {
    const headers = new Map<string, string>();
    const req = { headers: { origin: 'https://app.propchain.example' }, method: 'OPTIONS' } as unknown as Request;
    const res = {
      setHeader: jest.fn((k: string, v: string) => headers.set(k, v)),
      getHeader: jest.fn((k: string) => headers.get(k)),
      removeHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      end: jest.fn(),
    } as unknown as Response;
    const next = jest.fn() as unknown as NextFunction;

    new SecurityHeadersMiddleware().use(req, res, next);

    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});
```

## 8. Checklist before submitting extension middleware

- [ ] `next()` is called exactly once on every non-terminal path.
- [ ] `next()` runs inside `AsyncLocalStorage.run(...)` when context is used.
- [ ] Client-supplied headers are validated/length-limited before being echoed or logged.
- [ ] CORS has one owner; `Vary: Origin` is set for dynamic allowlisting.
- [ ] `configure()` is in the module that owns the routes (or the root module for `*`).
- [ ] DI-managed instances are resolved with `app.get()` before `app.use()`.
- [ ] Tests cover header propagation, context isolation, and preflight termination.
- [ ] Every new file is under `api-extensions/`.

## References in the host codebase (read-only)

- `src/common/request-id.middleware.ts` — `AsyncLocalStorage<Map<string, string>>`, `REQUEST_ID_HEADER`, `getCurrentRequestId()`.
- `src/versioning/version.middleware.ts` — multi-source version extraction, validation, `req.apiVersion`, `BadRequestException` for unsupported/sunset versions.
- `src/app.module.ts` — `configure(consumer)` applying `RequestIdMiddleware` to all routes.
- `api-extensions/docs/interceptors-with-rxjs.md` — the companion guide for response/result transformations.
