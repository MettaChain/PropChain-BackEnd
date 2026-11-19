# Error Handling and i18n for API Extensions

Issue: #1583 · Target: `api-extensions/docs/`

This guide describes how an extension living in `api-extensions/` should report errors so that
clients see one predictable response shape in every language. All files created by the examples
below are inside `api-extensions/`; the core files named in the "existing behaviour" sections are
**read-only references** (do not edit them from an extension).

## 1. Existing behaviour to build on

### 1.1 The global filter chain

`src/app.module.ts` registers four filters globally with `APP_FILTER`, in this order:

| Registration order | Filter (`src/common/filters/…`)        | `@Catch` target                        |
| ------------------ | -------------------------------------- | -------------------------------------- |
| 1                  | `validation-exception.filter.ts`       | `BadRequestException`                  |
| 2                  | `prisma-exception.filter.ts`           | `Prisma.PrismaClientKnownRequestError` |
| 3                  | `http-exception.filter.ts`             | `HttpException`                        |
| 4                  | `all-exceptions.filter.ts`             | nothing (`@Catch()` – catch-all)       |

Nest picks the **most specific** matching filter, not simply the first registered one. Therefore:

- a `BadRequestException` from `ValidationPipe` is standardized into a `VALIDATION_ERROR` envelope;
- Prisma errors (`P2002`, `P2025`, `P2003`, `P2014`, `P2000`, `P2011`) are mapped to 409/404/400 and
  translated with `prisma.*` keys;
- any other `HttpException` is localized via `http.<status>` (falling back to the key itself when
  the catalogue has no entry);
- anything unhandled becomes a 500 with a safe, localized message. `NODE_ENV=development` adds a
  `stack` legacy field; `NODE_ENV=production` never leaks one.

`src/main.ts` deliberately does **not** call `useGlobalFilters()` – doing so would register the same
filters twice. An extension must not re-register these global filters; register only its own domain
filter (see §6). The response/tracing interceptors (`ResponseFormatInterceptor`,
`TraceInterceptor`) supply `x-trace-id`, which filters copy into the envelope via `extractTraceId()`.

### 1.2 The canonical error envelope

`src/common/contracts/error-response.ts` defines `buildErrorResponse()` and the `ErrorResponse`
interface. Every error path uses this shape:

```json
{
  "success": false,
  "statusCode": 404,
  "code": "NOT_FOUND",
  "message": "No se encontró la tasación 3f1c…",
  "details": [{ "code": "VALUATION_NOT_FOUND", "id": "3f1c…" }],
  "traceId": "0f9c7b1e-…",
  "timestamp": "2026-11-19T12:00:00.000Z",
  "path": "/api/v2/extensions/valuations/3f1c…",
  "language": "es",
  "errors": [{ "code": "VALUATION_NOT_FOUND", "id": "3f1c…" }]
}
```

| Field        | Contract                                                                        |
| ------------ | ------------------------------------------------------------------------------- |
| `success`    | always `false`                                                                  |
| `statusCode` | HTTP status                                                                     |
| `code`       | stable machine code derived from the status (`statusCodeToErrorCode`)          |
| `message`    | human-readable, localized string                                                |
| `details`    | structured, error-specific data (validation entries, field errors, domain data) |
| `traceId`    | correlates with `x-trace-id`; `null` when tracing is unavailable                |
| `timestamp`  | ISO-8601                                                                        |
| `path`       | request URL                                                                     |
| `language`   | resolved language (`en` / `es`)                                                 |
| `errors`     | legacy alias of `details`, emitted by the built-in filters for older clients     |

**Rule:** keep `code` tied to the HTTP status for client compatibility. Put extension-specific
identifiers such as `INSPECTION_SLOT_CONFLICT` in `details[].code`, not in the top-level `code`.

### 1.3 HTTP status → error code mapping

`statusCodeToErrorCode()` in `src/common/contracts/error-response.ts` uses:

| Status | `code`                | Status | `code`                  |
| ------ | --------------------- | ------ | ----------------------- |
| 400    | `BAD_REQUEST`         | 410    | `GONE`                  |
| 401    | `UNAUTHORIZED`        | 413    | `PAYLOAD_TOO_LARGE`     |
| 403    | `FORBIDDEN`           | 415    | `UNSUPPORTED_MEDIA_TYPE`|
| 404    | `NOT_FOUND`           | 422    | `UNPROCESSABLE_ENTITY`  |
| 405    | `METHOD_NOT_ALLOWED`  | 429    | `RATE_LIMITED`          |
| 409    | `CONFLICT`            | 500    | `INTERNAL_ERROR`        |
| 502    | `BAD_GATEWAY`         | 503    | `SERVICE_UNAVAILABLE`   |
| 504    | `GATEWAY_TIMEOUT`     | other  | `HTTP_<status>`         |

Validation errors are the one documented override: `ValidationExceptionFilter` sets
`code: 'VALIDATION_ERROR'` and `details` is an array of
`{ field, message, code, constraints? }` entries (codes such as `IS_UUID`, `MIN_LENGTH`).

## 2. Exception filter mechanics

A filter is a class annotated with `@Catch(...)` that implements `ExceptionFilter.catch(exception,
host)`:

- `host.switchToHttp()` exposes the transport; `getRequest<Request>()` and `getResponse<Response>()`
  give typed Express objects.
- `@Catch(HttpException)` catches Nest HTTP exceptions; `@Catch(Prisma.PrismaClientKnownRequestError)`
  catches a specific library error; `@Catch()` catches everything (this is the safety net).
- Filters run **outside** guards/interceptors, so they are the last place to translate an error and
  the right place to attach `traceId`, `path`, `language` and safe legacy fields.
- Never return Prisma errors, stacks, SQL text or raw DTO internals in a response body.

Minimal skeleton (file lives in the extension folder):

```ts
// api-extensions/filters/example.filter.ts
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { I18nService } from '../../src/i18n/i18n.service'; // read-only core import
import { buildErrorResponse } from '../../src/common/contracts/error-response'; // read-only

@Catch(HttpException)
export class ExampleFilter implements ExceptionFilter {
  private readonly logger = new Logger(ExampleFilter.name);

  constructor(private readonly i18n: I18nService) {}

  catch(exception: HttpException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus();

    this.logger.warn(`${status} ${request.method} ${request.originalUrl}`);
    response.status(status).json(
      buildErrorResponse({
        statusCode: status,
        message: this.i18n.tFor('http.' + status, 'en'),
        path: request.originalUrl,
        language: 'en',
      }),
    );
  }
}
```

## 3. i18n integration

`src/i18n/i18n.service.ts` loads `src/i18n/translations/{en,es}.json` synchronously at module init
(`I18nModule` is `@Global()`, so `I18nService` can be injected anywhere).

Key API:

| Method                                       | Purpose                                                       |
| -------------------------------------------- | ------------------------------------------------------------- |
| `resolveLanguage({ userPreference, acceptLanguageHeader })` | `userPreference` → `Accept-Language` (q-values honoured) → `en` |
| `tFor(key, lang, params?)`                   | translate a dotted key; `{name}` placeholders are interpolated|
| `translate(key, input, params?)`             | resolve language and translate in one call                     |
| `hasLanguage(lang)`                          | guard before calling `tFor`                                   |

Filter language resolution used by the core filters is, in order:

1. `request.user?.languagePreference` (set by the auth guard),
2. `x-language` request header,
3. `Accept-Language` header (RFC 7231 parsing, `q=0` ignored),
4. `DEFAULT_LANGUAGE` (`en`).

Missing keys are **not** silent: the service records them in an in-memory ring, increments
`translations_missing_total` (when metrics are available), logs at most once per key per minute and
returns the raw key. Ship every message in both catalogues.

Reuse existing keys where possible (`common.validation_failed`, `common.not_found`,
`properties.not_found`, `http.409`, `prisma.P2002`, `validation.required`). For extension-specific
messages, keep a catalogue under the extension folder and instantiate an extension-scoped service:

```ts
// api-extensions/i18n/extension-i18n.ts
import { join } from 'path';
import { I18nService } from '../../src/i18n/i18n.service'; // read-only core import

export const extensionI18n = new I18nService(
  join(process.cwd(), 'api-extensions', 'i18n', 'translations'),
);
extensionI18n.onModuleInit();
```

The directory must contain `en.json` and `es.json` with the same dotted keys, e.g.
`extensions.inspection.slot_conflict` → `"Slot {{time}} is already booked"`.

## 4. Domain exceptions

Throw explicit exceptions from services; let filters decide how they are rendered. Extend Nest's
HTTP exceptions (or `HttpException` directly) and carry an i18n key plus structured details.

```ts
// api-extensions/filters/extension.errors.ts
import { ConflictException, HttpException, HttpStatus, NotFoundException } from '@nestjs/common';

/** Base class: message is an i18n key, never user-facing prose. */
export class ExtensionDomainError extends HttpException {
  constructor(
    public readonly i18nKey: string,
    status: HttpStatus,
    public readonly domainCode: string,
    public readonly i18nParams?: Record<string, string | number>,
    public readonly errorDetails?: Record<string, unknown>,
  ) {
    super(i18nKey, status);
  }
}

export class ValuationNotFoundError extends ExtensionDomainError {
  constructor(id: string) {
    super(
      'extensions.valuation.not_found',
      HttpStatus.NOT_FOUND,
      'VALUATION_NOT_FOUND',
      { id },
      { id },
    );
  }
}

export class InspectionSlotConflictError extends ExtensionDomainError {
  constructor(propertyId: string, time: string) {
    super(
      'extensions.inspection.slot_conflict',
      HttpStatus.CONFLICT,
      'INSPECTION_SLOT_CONFLICT',
      { time },
      { propertyId, time },
    );
  }
}

// Plain Nest exceptions are fine when no custom message is needed; the global
// HttpExceptionFilter will translate the string or dotted key it carries.
export class LeaseAlreadyActiveError extends ConflictException {
  constructor(leaseId: string) {
    super('extensions.lease.already_active', { cause: { leaseId } });
  }
}

// Keep NotFoundException in the toolkit for simple lookups.
export { NotFoundException };
```

## 5. Choosing the right error path

| Situation                                       | Throw                                                     | Rendered by                        |
| ----------------------------------------------- | --------------------------------------------------------- | ---------------------------------- |
| Invalid DTO field                               | nothing – `ValidationPipe` throws `BadRequestException`    | `ValidationExceptionFilter`        |
| Duplicate row / FK violation                    | nothing – Prisma throws `P2002`/`P2003`                   | `PrismaExceptionFilter`            |
| Extension entity missing / state conflict       | `ExtensionDomainError` subclass                           | extension domain filter (below)    |
| Auth / permission failure                        | `UnauthorizedException` / `ForbiddenException` in a guard | `HttpExceptionFilter`              |
| Unexpected failure                               | rethrow; do not swallow                                   | `AllExceptionsFilter` (500)        |

Use `HttpStatus` constants rather than magic numbers. Do not `try/catch` only to rethrow the same
error; catch to add context (and log with `Logger.error(message, stack)`), then rethrow.

## 6. Complete example

Five extension-local files. The core imports are read-only; nothing outside `api-extensions/`
is modified.

### 6.1 Filter

```ts
// api-extensions/filters/extension-domain.filter.ts
import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import {
  I18nService,
  SupportedLanguage,
} from '../../src/i18n/i18n.service'; // read-only core import
import {
  buildErrorResponse,
  extractTraceId,
  statusCodeToErrorCode,
} from '../../src/common/contracts/error-response'; // read-only core import
import { ExtensionDomainError } from './extension.errors';

interface LocalizedRequest extends Request {
  user?: { languagePreference?: string | null };
}

@Catch(ExtensionDomainError)
export class ExtensionDomainFilter implements ExceptionFilter {
  private readonly logger = new Logger(ExtensionDomainFilter.name);

  constructor(private readonly i18n: I18nService) {}

  catch(exception: ExtensionDomainError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<LocalizedRequest>();
    const response = ctx.getResponse<Response>();
    const language = this.resolveLanguage(request);
    const status = exception.getStatus();

    this.logger.warn(
      `${exception.domainCode} - ${status} - ${request.method} ${request.originalUrl}`,
    );

    response.status(status).json(
      buildErrorResponse({
        statusCode: status,
        // Keep the stable status-derived code at the top level.
        code: statusCodeToErrorCode(status),
        message: this.i18n.tFor(exception.i18nKey, language, exception.i18nParams),
        details: [
          {
            code: exception.domainCode,
            ...(exception.errorDetails ?? {}),
          },
        ],
        traceId: extractTraceId(request),
        path: request.originalUrl,
        language,
        legacy: { errors: exception.errorDetails },
      }),
    );
  }

  private resolveLanguage(request: LocalizedRequest): SupportedLanguage {
    const xLanguage =
      typeof request.headers['x-language'] === 'string' ? request.headers['x-language'] : null;
    const acceptLanguage =
      typeof request.headers['accept-language'] === 'string'
        ? request.headers['accept-language']
        : null;
    return this.i18n.resolveLanguage({
      userPreference: request.user?.languagePreference ?? xLanguage,
      acceptLanguageHeader: acceptLanguage,
    });
  }
}
```

### 6.2 Catalogue

```json
// api-extensions/i18n/translations/en.json
{
  "extensions": {
    "valuation": { "not_found": "Valuation {{id}} was not found" },
    "inspection": { "slot_conflict": "The slot at {{time}} is already booked" },
    "lease": { "already_active": "An active lease already exists" }
  }
}
```

```json
// api-extensions/i18n/translations/es.json
{
  "extensions": {
    "valuation": { "not_found": "No se encontró la tasación {{id}}" },
    "inspection": { "slot_conflict": "El horario de las {{time}} ya está reservado" },
    "lease": { "already_active": "Ya existe un contrato de arrendamiento activo" }
  }
}
```

### 6.3 Service

```ts
// api-extensions/services/valuation-lookup.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../src/database/prisma.service'; // read-only core import
import { ValuationNotFoundError } from '../filters/extension.errors';

@Injectable()
export class ValuationLookupService {
  private readonly logger = new Logger(ValuationLookupService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getById(id: string) {
    // Replace `propertyValuation` with the delegate generated for your
    // extension model; the error contract stays the same.
    const valuation = await this.prisma['propertyValuation'].findUnique({ where: { id } });
    if (!valuation) {
      this.logger.warn(`Valuation ${id} not found`);
      throw new ValuationNotFoundError(id);
    }
    return valuation;
  }
}
```

### 6.4 Controller

```ts
// api-extensions/modules/extension-valuations/extension-valuations.controller.ts
import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ValuationLookupService } from '../../services/valuation-lookup.service';

@ApiTags('Extension Valuations')
@Controller('extensions/v2/valuations')
export class ExtensionValuationsController {
  constructor(private readonly service: ValuationLookupService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Fetch one valuation' })
  @ApiResponse({ status: 404, description: 'Valuation not found (localized envelope)' })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.getById(id);
  }
}
```

### 6.5 Module registration

```ts
// api-extensions/modules/extension-valuations/extension-valuations.module.ts
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { I18nService } from '../../../src/i18n/i18n.service'; // read-only core import
import { ExtensionDomainFilter } from '../../filters/extension-domain.filter';
import { extensionI18n } from '../../i18n/extension-i18n';
import { ExtensionValuationsController } from './extension-valuations.controller';
import { ValuationLookupService } from '../../services/valuation-lookup.service';

@Module({
  controllers: [ExtensionValuationsController],
  providers: [
    ValuationLookupService,
    // The global core filters remain untouched; this filter is extension-only.
    { provide: APP_FILTER, useClass: ExtensionDomainFilter },
    // Optional: use the extension catalogue instead of the global one.
    { provide: I18nService, useValue: extensionI18n },
  ],
})
export class ExtensionValuationsModule {}
```

> Use one `I18nService` provider per module scope carefully: overriding the token inside a module
> means that module's filters and pipes use the extension catalogue. If you prefer the global
> catalogues, simply add the extension keys to `api-extensions/i18n/translations/*.json` and keep
> `extensionI18n` as a standalone service injected via its own token.

### 6.6 Result

`GET /api/v2/extensions/valuations/3f1c…` with `Accept-Language: es` returns the envelope shown in
§2 with `code: "NOT_FOUND"`, `details[0].code: "VALUATION_NOT_FOUND"`, and the Spanish message.
With `Accept-Language: en` the same request returns `"Valuation 3f1c… was not found"` and
`"language": "en"`. A malformed UUID never reaches the service: `ValidationPipe` produces a
`VALIDATION_ERROR` envelope with a `details[]` entry for the `id` field.

## 7. Review checklist

- [ ] Every error path emits the canonical envelope (no ad-hoc `{ error: ... }` bodies).
- [ ] Top-level `code` comes from `statusCodeToErrorCode()`; domain codes live in `details`.
- [ ] User-facing strings are i18n keys translated with the resolved language; no hardcoded prose.
- [ ] Every key exists in `en.json` and `es.json` with matching placeholders.
- [ ] No stack, SQL, Prisma internals, tokens or PII appear in `message`/`details`.
- [ ] `traceId`, `path`, `language` and `timestamp` are present.
- [ ] Only extension filters are registered in extension modules; global filters are untouched.
- [ ] Failure paths are covered with localized assertions (illustrative tests may live under
      `api-extensions/tests/`), including the catch-all 500 path.
