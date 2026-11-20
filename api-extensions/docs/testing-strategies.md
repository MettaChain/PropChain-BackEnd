# Testing Strategies for API Extensions (`api-extensions/`)

> **Scope.** Every example file path in this guide is inside `api-extensions/`.
> Files under `src/`, `prisma/`, `test/`, and the repository root are read-only
> references; imports from those locations refer to existing providers and
> helpers. The `*.spec.ts` snippets shown here are **illustrative** — this guide
> does not add runnable test files.

Extensions must be testable without touching the main codebase. That means:
no real database in unit tests, no real cache, no outbound notifications, and
no edits to shared fixtures to make an extension test pass. Mock the edge, then
assert your own logic.

## 1. Test levels and where they live

| Level | Location under `api-extensions/` | File name pattern | What it covers |
| --- | --- | --- | --- |
| Unit | `tests/unit/` (or next to the file) | `<name>.service.spec.ts`, `<name>.interceptor.spec.ts`, `<name>.middleware.spec.ts` | One class, all collaborators mocked |
| Integration | `tests/integration/` | `<feature>.integration.spec.ts` | Controller + service + validated DTOs, mocked providers, in-memory Nest app |
| E2E | `tests/e2e/` | `<feature>.e2e.spec.ts` | Full HTTP flow through `supertest` against `app.getHttpServer()` |

The root `jest.config.js` uses `testRegex: '.*\\.spec\\.ts$'`, so all of the
names above are discovered automatically. Other relevant settings:
`testEnvironment: 'node'`, `testTimeout: 30000`, `ts-jest` with
`diagnostics: false`, and `transformIgnorePatterns: ['node_modules/(?!uuid)']`
(uuid v14+ is ESM-only). Treat the checked-in config as authoritative for
thresholds — it changes independently of this folder.

Two caveats specific to this checkout:

- `collectCoverageFrom` only includes `src/**/*`, so extension files are **not**
  counted by the root coverage command by default. A separate Jest config under
  `api-extensions/` would be needed to enforce coverage for extensions.
  Also note that the checked-in `jest.config.js` currently has an unterminated
  `src/sessions/` threshold block, so `require`-ing it fails until core fixes
  it; do not edit it from an extension issue.
- The issue text refers to `src/test/unit/` and `src/test/e2e/`. In this
  checkout the suites actually live in `test/unit/` and `test/e2e/`, for example
  `test/unit/response-format.interceptor.spec.ts`,
  `test/unit/request-id.middleware.spec.ts`, and
  `test/e2e/favorites.e2e.spec.ts`. Follow the current layout.

## 2. Unit tests with mocked providers

For a class with injected collaborators, prefer direct construction when there
is no DI subtlety to verify, and `@nestjs/testing` when you want to assert that
the module wiring resolves. Both styles are used in this repository.

```ts
// api-extensions/tests/unit/amenity-management.service.spec.ts (style example)
import { ConflictException } from '@nestjs/common';
import { AmenityManagementService } from '../../modules/amenity-management/amenity-management.service';

describe('AmenityManagementService', () => {
  let service: AmenityManagementService;

  beforeEach(() => {
    service = new AmenityManagementService();
  });

  it('rejects duplicate amenity names', () => {
    service.create({ name: 'Pool', category: 'EXTERIOR' as never, icon: 'pool' });

    expect(() =>
      service.create({ name: ' pool ', category: 'EXTERIOR' as never, icon: 'pool' }),
    ).toThrow(ConflictException);
  });
});
```

Habits that keep unit tests stable:

- `jest.clearAllMocks()` in `beforeEach` (or `jest.resetAllMocks()` if you also
  re-program implementations).
- Arrange / Act / Assert, with the mock return value set **before** the call.
- Assert on behaviour, not on implementation details: prefer
  `expect(result).toEqual(...)` over counting internal calls unless the call is
  the contract (for example "notification was sent").
- Never open a Prisma connection, cache client, or socket in a unit test.

## 3. Mocking `PrismaService`, `CacheService`, `NotificationsService`

| Provider | Real methods used by extensions | Mock shape |
| --- | --- | --- |
| `PrismaService` | `property.findUnique`, `findMany`, `count`, `$transaction`, `deleteMany` | `{ property: { findUnique: jest.fn(), findMany: jest.fn() }, $transaction: jest.fn((ops) => Promise.all(ops)) }` |
| `CacheService` | `get` (returns `CacheResult<T>` with `status`, `data`, `timestamp`), `set`, `del` | `{ get: jest.fn().mockResolvedValue({ status: CacheOperationStatus.MISS, timestamp: new Date() }), set: jest.fn().mockResolvedValue({ status: CacheOperationStatus.SUCCESS, timestamp: new Date() }) }` |
| `NotificationsService` | `sendNotification(userId, title, message, type, metadata?)` | `{ sendNotification: jest.fn().mockResolvedValue(undefined) }` |

Notes:

- `CacheService.get()` does **not** return a bare value. Use
  `CacheOperationStatus.SUCCESS | MISS | ERROR` from `src/cache/cache.types.ts`
  and include a `timestamp` in fake results; `CacheService.set()` takes
  `(key, value, ttlSeconds, tag?)`.
- Prisma `Decimal` fields (price, bathrooms) compare awkwardly with plain
  numbers. In mocks, return a value whose `toString()`/`valueOf()` matches what
  the service expects, and convert in the service before doing arithmetic.
- For `$transaction`, a `Promise.all(arrayOfPromises)` fake is enough for most
  service tests; only integration tests need to model rollback semantics.
- Keep mock factories in `api-extensions/tests/helpers/` when three or more
  specs need the same provider, but avoid a giant shared "universal" fixture
  that hides what a test actually needs.

## 4. Complete service test example

First the (illustrative) service under test, which reads through a cache,
queries a projected set of fields, and emits a notification:

```ts
// api-extensions/services/extension-property-valuation.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { CacheService } from '../../src/cache/cache.service';
import { CacheOperationStatus } from '../../src/cache/cache.types';
import { PrismaService } from '../../src/database/prisma.service';
import { NotificationsService } from '../../src/notifications/notifications.service';

export interface ValuationResult {
  propertyId: string;
  estimatedValue: number;
  source: 'cache' | 'database';
}

@Injectable()
export class ExtensionPropertyValuationService {
  private readonly ttlSeconds = 60;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly notifications: NotificationsService,
  ) {}

  async estimate(propertyId: string): Promise<ValuationResult> {
    const key = `extension:valuation:${propertyId}`;
    const cached = await this.cache.get<ValuationResult>(key);
    if (cached.status === CacheOperationStatus.SUCCESS && cached.data) {
      return cached.data;
    }

    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true, price: true, bedrooms: true, ownerId: true },
    });
    if (!property) throw new NotFoundException(`Property ${propertyId} not found`);

    const estimatedValue = Math.round(
      Number(property.price) * (1 + (property.bedrooms ?? 0) * 0.01),
    );
    const result: ValuationResult = { propertyId, estimatedValue, source: 'database' };

    await this.cache.set(key, result, this.ttlSeconds, 'extension-valuation');
    await this.notifications.sendNotification(
      property.ownerId,
      'Valuation ready',
      `Estimate for ${propertyId} is ${estimatedValue}`,
      'VALUATION_READY',
      { propertyId },
    );
    return result;
  }
}
```

And its test, using `TestingModule` to prove that the providers are wired by
token while keeping all three collaborators fake:

```ts
// api-extensions/tests/unit/extension-property-valuation.service.spec.ts
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CacheService } from '../../../src/cache/cache.service';
import { CacheOperationStatus } from '../../../src/cache/cache.types';
import { PrismaService } from '../../../src/database/prisma.service';
import { NotificationsService } from '../../../src/notifications/notifications.service';
import { ExtensionPropertyValuationService } from '../../services/extension-property-valuation.service';

describe('ExtensionPropertyValuationService', () => {
  let service: ExtensionPropertyValuationService;

  const prisma = { property: { findUnique: jest.fn() } };
  const cache = { get: jest.fn(), set: jest.fn() };
  const notifications = { sendNotification: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        ExtensionPropertyValuationService,
        { provide: PrismaService, useValue: prisma },
        { provide: CacheService, useValue: cache },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();

    service = moduleRef.get(ExtensionPropertyValuationService);
  });

  it('returns a cached valuation without querying the database', async () => {
    const cached = { propertyId: 'p1', estimatedValue: 250000, source: 'cache' as const };
    cache.get.mockResolvedValue({
      status: CacheOperationStatus.SUCCESS,
      data: cached,
      timestamp: new Date(),
    });

    await expect(service.estimate('p1')).resolves.toEqual(cached);
    expect(prisma.property.findUnique).not.toHaveBeenCalled();
    expect(notifications.sendNotification).not.toHaveBeenCalled();
  });

  it('computes, caches and notifies on a cache miss', async () => {
    cache.get.mockResolvedValue({ status: CacheOperationStatus.MISS, timestamp: new Date() });
    prisma.property.findUnique.mockResolvedValue({
      id: 'p1',
      price: { toString: () => '200000' },
      bedrooms: 3,
      ownerId: 'owner-1',
    });
    cache.set.mockResolvedValue({ status: CacheOperationStatus.SUCCESS, timestamp: new Date() });
    notifications.sendNotification.mockResolvedValue(undefined);

    const result = await service.estimate('p1');

    expect(result).toEqual({ propertyId: 'p1', estimatedValue: 206000, source: 'database' });
    expect(prisma.property.findUnique).toHaveBeenCalledWith({
      where: { id: 'p1' },
      select: { id: true, price: true, bedrooms: true, ownerId: true },
    });
    expect(cache.set).toHaveBeenCalledWith(
      'extension:valuation:p1',
      result,
      60,
      'extension-valuation',
    );
    expect(notifications.sendNotification).toHaveBeenCalledWith(
      'owner-1',
      'Valuation ready',
      expect.stringContaining('206000'),
      'VALUATION_READY',
      { propertyId: 'p1' },
    );
  });

  it('throws NotFoundException when the property does not exist', async () => {
    cache.get.mockResolvedValue({ status: CacheOperationStatus.MISS, timestamp: new Date() });
    prisma.property.findUnique.mockResolvedValue(null);

    await expect(service.estimate('missing')).rejects.toBeInstanceOf(NotFoundException);
    expect(cache.set).not.toHaveBeenCalled();
    expect(notifications.sendNotification).not.toHaveBeenCalled();
  });
});
```

## 5. Integration tests with `TestingModule`

Integration tests wire a controller to the real service but keep infrastructure
fake. Build the app with `createNestApplication()`, apply the same global pipes
as production (`ValidationPipe({ whitelist: true, transform: true })`), and
initialise it with `await app.init()`.

```ts
// api-extensions/tests/integration/property-valuation.integration.spec.ts
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CacheService } from '../../../src/cache/cache.service';
import { CacheOperationStatus } from '../../../src/cache/cache.types';
import { PrismaService } from '../../../src/database/prisma.service';
import { NotificationsService } from '../../../src/notifications/notifications.service';
import { ExtensionPropertyValuationService } from '../../services/extension-property-valuation.service';
import { PropertyValuationController } from '../../modules/property-valuation/property-valuation.controller';

describe('PropertyValuation integration', () => {
  let app: INestApplication;
  const prisma = { property: { findUnique: jest.fn() } };
  const cache = { get: jest.fn(), set: jest.fn() };
  const notifications = { sendNotification: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PropertyValuationController],
      providers: [
        ExtensionPropertyValuationService,
        { provide: PrismaService, useValue: prisma },
        { provide: CacheService, useValue: cache },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('resolves the controller with real service logic', () => {
    expect(app.get(PropertyValuationController)).toBeDefined();
    expect(app.get(ExtensionPropertyValuationService)).toBeDefined();
  });
});
```

## 6. E2E tests with `supertest`

E2E tests exercise routing, pipes, guards/interceptors, and serialisation over
HTTP. `src/test/e2e/` is referenced by the issues but the actual folder in this
checkout is `test/e2e/`; see `test/e2e/favorites.e2e.spec.ts` and
`test/e2e/transaction-lifecycle.e2e.spec.ts` for the established pattern.

```ts
// api-extensions/tests/e2e/property-valuation.e2e.spec.ts
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { CacheService } from '../../../src/cache/cache.service';
import { CacheOperationStatus } from '../../../src/cache/cache.types';
import { PrismaService } from '../../../src/database/prisma.service';
import { NotificationsService } from '../../../src/notifications/notifications.service';
import { ExtensionPropertyValuationService } from '../../services/extension-property-valuation.service';
import { PropertyValuationController } from '../../modules/property-valuation/property-valuation.controller';

describe('PropertyValuation e2e', () => {
  let app: INestApplication;
  const prisma = { property: { findUnique: jest.fn() } };
  const cache = { get: jest.fn(), set: jest.fn() };
  const notifications = { sendNotification: jest.fn() };

  beforeAll(async () => {
    cache.get.mockResolvedValue({ status: CacheOperationStatus.MISS, timestamp: new Date() });
    cache.set.mockResolvedValue({ status: CacheOperationStatus.SUCCESS, timestamp: new Date() });
    prisma.property.findUnique.mockResolvedValue({
      id: 'p1',
      price: { toString: () => '200000' },
      bedrooms: 3,
      ownerId: 'owner-1',
    });

    const moduleRef = await Test.createTestingModule({
      controllers: [PropertyValuationController],
      providers: [
        ExtensionPropertyValuationService,
        { provide: PrismaService, useValue: prisma },
        { provide: CacheService, useValue: cache },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/extensions/property-valuation/:id returns a valuation', async () => {
    await request(app.getHttpServer())
      .get('/api/extensions/property-valuation/p1')
      .expect(200)
      .expect((res) => {
        expect(res.body.data.estimatedValue).toBe(206000);
      });
  });

  it('rejects an invalid property id before reaching the service', async () => {
    await request(app.getHttpServer())
      .get('/api/extensions/property-valuation/not%20an%20id')
      .expect(400);
  });
});
```

## 7. Guards and interceptors with a mocked `ExecutionContext`

Guards and interceptors rarely need a live app. Build the minimum
`ExecutionContext` surface they actually use.

```ts
// api-extensions/tests/helpers/execution-context.factory.ts
import { ExecutionContext } from '@nestjs/common';

export function mockExecutionContext(options: {
  request?: Record<string, unknown>;
  response?: Record<string, unknown>;
  handler?: (...args: unknown[]) => unknown;
  controller?: new (...args: unknown[]) => unknown;
} = {}): ExecutionContext {
  const request = options.request ?? { headers: {}, authUser: undefined };
  const response = options.response ?? { statusCode: 200 };
  return {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
    getHandler: () => options.handler ?? (() => undefined),
    getClass: () => options.controller ?? class TestController {},
    getArgs: () => [request, response],
  } as unknown as ExecutionContext;
}
```

Guard test (with `Reflector` metadata mocked):

```ts
// api-extensions/tests/unit/verified-email.guard.spec.ts
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { VerifiedEmailGuard } from '../../guards/verified-email.guard';
import { mockExecutionContext } from '../helpers/execution-context.factory';

describe('VerifiedEmailGuard', () => {
  const reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
  const guard = new VerifiedEmailGuard(reflector);

  it('allows a verified user', () => {
    reflector.getAllAndOverride = jest.fn().mockReturnValue(true);
    const context = mockExecutionContext({
      request: { authUser: { sub: 'u1', emailVerified: true } },
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('blocks an unverified user', () => {
    reflector.getAllAndOverride = jest.fn().mockReturnValue(true);
    const context = mockExecutionContext({
      request: { authUser: { sub: 'u2', emailVerified: false } },
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
```

Interceptor test (`of` for success, `throwError` for failure, `firstValueFrom`
to await the single HTTP emission). See
`test/unit/response-format.interceptor.spec.ts` and
`test/unit/trace.interceptor.spec.ts` in the host suite for fuller examples:

```ts
// api-extensions/tests/unit/api-envelope.interceptor.spec.ts
import { CallHandler } from '@nestjs/common';
import { firstValueFrom, of, throwError } from 'rxjs';
import { ApiEnvelopeInterceptor } from '../../interceptors/api-envelope.interceptor';
import { mockExecutionContext } from '../helpers/execution-context.factory';

describe('ApiEnvelopeInterceptor', () => {
  const interceptor = new ApiEnvelopeInterceptor();
  const context = mockExecutionContext();

  it('wraps a raw value once', async () => {
    const next: CallHandler = { handle: () => of({ id: 'p1' }) };

    const result = await firstValueFrom(interceptor.intercept(context, next));

    expect(result).toMatchObject({ success: true, data: { id: 'p1' } });
  });

  it('propagates handler errors unchanged', async () => {
    const error = new Error('boom');
    const next: CallHandler = { handle: () => throwError(() => error) };

    await expect(firstValueFrom(interceptor.intercept(context, next))).rejects.toBe(error);
  });
});
```

## 8. Organisation and naming conventions

- Use `describe('<ClassName>')` at the top level and `it('should ...')` or a
  plain behaviour sentence inside. Group by method:
  `describe('estimate()', () => { ... })`.
- Keep spec files beside the file under test or under
  `api-extensions/tests/<unit|integration|e2e>/`; do not mix both for the same
  subject.
- Suffix by level: `.service.spec.ts`, `.controller.spec.ts`,
  `.guard.spec.ts`, `.interceptor.spec.ts`, `.middleware.spec.ts`,
  `.integration.spec.ts`, `.e2e.spec.ts`. All end in `.spec.ts` so Jest picks
  them up.
- Name fake providers after the token they replace (`prismaMock`,
  `cacheMock`) and shared helpers `mock*.factory.ts` under
  `api-extensions/tests/helpers/`.
- One assertion theme per test. Prefer three small tests (hit, miss, error) to
  one "does everything" test.
- Do not modify `test/` fixtures or shared jest configuration to make an
  extension test pass.

## 9. Common pitfalls

- `CacheService.get()` returns a `CacheResult`, not the value — a bare value
  mock makes `cached.status` undefined and silently exercises the miss path.
- `jest.mock('uuid', ...)` is hoisted; reference mocked functions through
  `jest.mocked(...)` or a cast inside the test body, not from closure state
  initialised before the mock.
- Async-local-storage context (see
  `api-extensions/docs/custom-middleware.md`) is only visible inside the
  callback passed to `storage.run(...)`; assertions made after `next()` returns
  still work because `run()` is synchronous, but detached callbacks need care.
- `request.headers` keys are lowercase in Express; use `x-request-id`, not
  `X-Request-Id`, when reading.
- `done()` plus an async/await return in the same test causes double-finish
  errors — use one style.
- Interceptor tests must not call `.subscribe()` on the returned observable if
  using `firstValueFrom`; Nest does the subscribing in production.

## References in the host codebase (read-only)

- `jest.config.js` — test regex, transform, timeout, coverage settings (and the
  currently unterminated `src/sessions/` threshold block).
- `test/unit/` — unit examples, especially `response-format.interceptor.spec.ts`,
  `trace.interceptor.spec.ts`, and `request-id.middleware.spec.ts`.
- `test/e2e/` — supertest patterns, especially `favorites.e2e.spec.ts` and
  `transaction-lifecycle.e2e.spec.ts`.
- `src/cache/cache.types.ts` / `src/cache/cache.service.ts` — `CacheResult`
  contract and `get`/`set` signatures used by mocks.
- `src/notifications/notifications.service.ts` — `sendNotification` signature.
