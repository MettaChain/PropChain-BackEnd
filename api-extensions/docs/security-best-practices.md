# Security Best Practices for API Extensions

Issue: #1585 · Target: `api-extensions/docs/`

This guide collects the security controls an extension under `api-extensions/` must apply. Core
materials are **read-only references**: [`docs/SECURITY.md`](../../docs/SECURITY.md),
[`docs/RBAC_Permission_Matrix.md`](../../docs/RBAC_Permission_Matrix.md),
[`docs/LOGIN_RATE_LIMITING.md`](../../docs/LOGIN_RATE_LIMITING.md) and
`src/auth/sanitize.util.ts`. Every file created by the examples below is inside `api-extensions/`.

Threat model in one line: untrusted JSON arrives over HTTP, crosses validation and authorization,
reaches Prisma, and comes back as JSON. Defend each hop.

## 1. Input validation and sanitization

### 1.1 ValidationPipe (already global)

`src/main.ts` configures a global `ValidationPipe` with `whitelist: true`,
`forbidNonWhitelisted: true`, `transform: true`, and an i18n-aware `exceptionFactory`. Extensions
inherit it; do not add a second global pipe. Consequences for extension DTOs:

- every body/query param must have `class-validator` decorators – unknown properties are rejected;
- use `@Type(() => Number)` / `@Type(() => Date)` for non-string query params;
- use `@IsUUID('4')` for ids, `@IsEnum()` for statuses, `@Min`/`@Max` for amounts and percentages;
- validation failures become a `VALIDATION_ERROR` envelope (see
  [error-handling-and-i18n.md](./error-handling-and-i18n.md)).

### 1.2 Sanitize before validating

`src/auth/sanitize.util.ts` shows the intended approach: NFKC-normalise, strip C0/C1 control
characters, remove HTML tags from free text, collapse whitespace, and **never transform secrets**
(passwords/tokens). Because extensions may not edit core files, keep an extension-local equivalent:

```ts
// api-extensions/utils/sanitize.util.ts
import { TransformFnParams } from 'class-transformer';

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
const HTML_TAGS = /<[^>]*>/g;

function sanitizeIdentifier(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return value.normalize('NFKC').replace(CONTROL_CHARS, '').trim();
}

function sanitizeText(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return value
    .normalize('NFKC')
    .replace(CONTROL_CHARS, '')
    .replace(HTML_TAGS, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** For emails, ids, slugs – do not strip angle brackets from a password. */
export const TrimIdentifier = ({ value }: TransformFnParams): unknown => sanitizeIdentifier(value);

/** For titles, descriptions, applicant names – also strips HTML. */
export const CleanText = ({ value }: TransformFnParams): unknown => sanitizeText(value);
```

```ts
// api-extensions/dto/maintenance-request.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { CleanText } from '../utils/sanitize.util';

export enum MaintenancePriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  EMERGENCY = 'EMERGENCY',
}

export class CreateMaintenanceRequestDto {
  @ApiProperty() @IsUUID('4') propertyId: string;

  @ApiProperty() @Transform(CleanText) @IsString() @IsNotEmpty() title: string;

  @ApiProperty()
  @Transform(CleanText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  description: string;

  @ApiProperty({ enum: MaintenancePriority })
  @IsEnum(MaintenancePriority)
  priority: MaintenancePriority;
}
```

Keep the decorator order `@Transform(...)` → `@IsString()` → length/format constraints. Bounding
free text prevents a 5 MB "description" from being stored, echoed back or used to inflate logs.

Nested objects need `@ValidateNested({ each: true })` **and** `@Type(() => NestedDto)`, otherwise
class-validator sees plain objects and skips their decorators:

```ts
// api-extensions/dto/commission-split.dto.ts
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsUUID, Max, Min, ValidateNested } from 'class-validator';

export class SplitParticipantDto {
  @IsUUID('4') userId: string;
  @Type(() => Number) @IsInt() @Min(0) @Max(100) splitPercentage: number;
}

export class CreateCommissionSplitDto {
  @IsUUID('4') transactionId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SplitParticipantDto)
  participants: SplitParticipantDto[];
}
```

Enforce cross-field invariants in the service (percentages total 100, dates ordered, amounts
positive) and throw `BadRequestException` / a domain error – class-validator does not express them
well.

### 1.3 Request-wide sanitization interceptor

An existing extension interceptor, `api-extensions/interceptors/request-sanitization.interceptor.ts`,
walks `body` and `query` recursively and strips HTML/control characters, honouring
`@SanitizeRequest({ stripHtml: false })`. Use it as defence in depth, not as a replacement for DTO
validation:

```ts
// api-extensions/modules/extension-maintenance/extension-maintenance.controller.ts
import { Body, Controller, Post, UseInterceptors } from '@nestjs/common';
import { RequestSanitizationInterceptor } from '../../interceptors/request-sanitization.interceptor';
import { CreateMaintenanceRequestDto } from '../../dto/maintenance-request.dto';

@Controller('extensions/v2/maintenance')
@UseInterceptors(RequestSanitizationInterceptor)
export class ExtensionMaintenanceController {
  @Post()
  create(@Body() dto: CreateMaintenanceRequestDto) {
    return dto; // service call omitted
  }
}
```

Also apply `api-extensions/interceptors/request-body-size-limit.interceptor.ts` to endpoints that
accept text blobs or arrays. Never log whole request bodies: they contain PII.

## 2. Output sanitization (prevent data leakage)

### 2.1 Explicit response DTOs

Never return a raw Prisma row. It can contain `password`, `twoFactorSecret`, internal IDs, soft-delete
flags or JSON metadata that was never meant for clients.

```ts
// api-extensions/dto/screening-response.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ScreeningRecommendation, ScreeningStatus } from './tenant-screening.dto';

export class ScreeningResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: ScreeningStatus }) status: ScreeningStatus;
  @ApiPropertyOptional() recommendation?: ScreeningRecommendation;
  @ApiPropertyOptional() overallScore?: number;
  @ApiProperty() createdAt: Date;
  // Deliberately absent: applicantEmail, creditScore, riskFactors, raw report JSON.
}

export function toScreeningResponse(row: Record<string, any>): ScreeningResponseDto {
  return {
    id: row.id,
    status: row.status,
    ...(row.recommendation ? { recommendation: row.recommendation } : {}),
    ...(row.overallScore !== undefined ? { overallScore: row.overallScore } : {}),
    createdAt: row.createdAt,
  };
}
```

Sensitive tenant-screening data (credit score, background status, risk factors) is only available to
ADMIN or the applicant themselves through a separate, audited endpoint.

### 2.2 Database-side field selection

Use Prisma `select` so forbidden columns never reach application memory:

```ts
// api-extensions/services/maintenance-request.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../src/database/prisma.service'; // read-only core import

@Injectable()
export class MaintenanceRequestService {
  constructor(private readonly prisma: PrismaService) {}

  async listForProperty(propertyId: string) {
    return this.prisma['maintenanceRequest'].findMany({
      where: { propertyId },
      select: {
        id: true,
        title: true,
        priority: true,
        status: true,
        createdAt: true,
        // no description/notes/assignedTo unless the caller is authorized
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}
```

### 2.3 Response scrubbing interceptor

As a final net, strip known secret keys from outgoing JSON. This is not a substitute for §2.1/§2.2.

```ts
// api-extensions/interceptors/output-sanitization.interceptor.ts
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

const DENYLIST = new Set([
  'password',
  'passwordHash',
  'twoFactorSecret',
  'twoFactorBackupCodes',
  'refreshToken',
  'accessToken',
  'apiKey',
  'keyHash',
  'ssn',
  'creditCardNumber',
]);

@Injectable()
export class OutputSanitizationInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((value) => this.scrub(value)));
  }

  private scrub(value: unknown, depth = 0): unknown {
    if (depth > 12 || value === null || typeof value !== 'object') return value;
    if (value instanceof Date) return value;
    if (Array.isArray(value)) return value.map((item) => this.scrub(item, depth + 1));

    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (!DENYLIST.has(key)) output[key] = this.scrub(item, depth + 1);
    }
    return output;
  }
}
```

Register it per extension module (`APP_INTERCEPTOR`) or with `@UseInterceptors(...)` on a
controller. Never echo a submitted password/token back, even in an error `details` object.

## 3. Authentication and authorization

### 3.1 Guard chain

`docs/SECURITY.md` specifies:

```
Request → AuthGuard(JWT) → RolesGuard → RequirePermissions → Controller
```

- `src/auth/guards/jwt-auth.guard.ts` validates the bearer token, attaches `request.authUser` and
  rejects missing/invalid tokens with `401`.
- `src/auth/guards/roles.guard.ts` compares `@Roles(...)` metadata with `request.authUser.role`.
- `src/auth/decorators/require-scopes.decorator.ts` constrains API keys with `read`/`write` scopes
  (see the API Key Scopes section of `docs/RBAC_Permission_Matrix.md`).
- Apply the chain at controller or handler level in the extension; guards run in declaration order.

```ts
// api-extensions/modules/extension-maintenance/extension-maintenance.controller.ts
import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import {
  JwtAuthGuard,
} from '../../../src/auth/guards/jwt-auth.guard'; // read-only core import
import {
  RolesGuard,
} from '../../../src/auth/guards/roles.guard'; // read-only core import
import { Roles } from '../../../src/auth/decorators/roles.decorator'; // read-only core import
import { VerifiedEmailGuard } from '../../guards/verified-email.guard';
import { ResourceOwnerGuard } from '../../guards/resource-owner.guard';

@Controller('extensions/v2/maintenance')
@UseGuards(JwtAuthGuard, RolesGuard, VerifiedEmailGuard)
@Roles('AGENT', 'ADMIN')
export class ExtensionMaintenanceController {
  @Get(':id')
  @UseGuards(ResourceOwnerGuard)
  findOne(@Param('id') id: string) {
    return { id };
  }
}
```

Authorization for mutation must be **resource-aware**: a role check alone does not stop AGENT A from
editing AGENT B's property.

```ts
// api-extensions/guards/resource-owner.guard.ts
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../src/database/prisma.service'; // read-only core import

export const OWNERSHIP_KEY = 'extension-ownership-resource';

interface AuthRequest {
  params: Record<string, string>;
  body?: Record<string, unknown>;
  authUser?: { sub?: string; role?: string };
}

@Injectable()
export class ResourceOwnerGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const resource = this.reflector.getAllAndOverride<string>(OWNERSHIP_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!resource) return true;

    const request = context.switchToHttp().getRequest<AuthRequest>();
    const userId = request.authUser?.sub;
    if (!userId) throw new ForbiddenException('No authenticated user');
    if (request.authUser?.role === 'ADMIN') return true;

    // Only a fixed set of resource names may reach Prisma – never interpolate
    // user input into a delegate name or a raw query.
    const allowed = new Set(['maintenanceRequest', 'valuation', 'inspection']);
    if (!allowed.has(resource)) throw new ForbiddenException('Unknown ownership resource');

    const record = await this.prisma[resource].findFirst({
      where: { id: request.params.id, property: { ownerId: userId } },
      select: { id: true },
    });
    if (!record) throw new ForbiddenException('You do not own this resource');
    return true;
  }
}
```

If a model does not expose a `property` relation, use an explicit service lookup and compare
`ownerId` / `agentId` – never fall back to trust in the client-supplied `ownerId`. Add existing
extension guards (`api-extensions/guards/feature-flag.guard.ts`,
`api-extensions/guards/verified-email.guard.ts`) only in addition to, not instead of, JWT/RBAC.

## 4. Rate limiting

`docs/SECURITY.md` sets these budgets; `docs/LOGIN_RATE_LIMITING.md` adds account lockout after
**5 failed logins in 15 minutes** with generic errors to prevent email enumeration:

| Scope   | Limit            | Window | Key                  |
| ------- | ---------------- | ------ | -------------------- |
| General | 100 requests     | 1 min  | client IP            |
| Auth    | 5 requests       | 15 min | IP + email           |
| Write   | 30 requests      | 1 min  | authenticated user   |
| Search  | 60 requests      | 1 min  | authenticated user   |

The global `RateLimitGuard` is already registered in `src/main.ts`; it reads `@CustomRateLimit()`
metadata and emits `X-RateLimit-*` headers. Configure extension endpoints with the existing
decorator (read-only import), or, if the endpoint needs a dedicated budget, use an extension-local
guard backed by the same Redis store rather than an in-memory Map:

```ts
// api-extensions/guards/extension-rate-limit.guard.ts
import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RateLimitService } from '../../src/auth/rate-limit.service'; // read-only core import

export const EXTENSION_LIMIT_KEY = 'extension-rate-limit';

export function ExtensionLimit(max: number, windowMs: number) {
  return (target: object, key?: string | symbol, descriptor?: PropertyDescriptor) => {
    const apply = (item: object) =>
      Reflect.defineMetadata(EXTENSION_LIMIT_KEY, { max, windowMs }, item);
    if (descriptor) apply(descriptor.value as object);
    else apply(target);
  };
}

@Injectable()
export class ExtensionRateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimitService: RateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<{ max: number; windowMs: number }>(
      EXTENSION_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!options) return true;

    const request = context.switchToHttp().getRequest<{
      authUser?: { sub?: string; tier?: string };
      ip?: string;
      headers: Record<string, string | string[] | undefined>;
    }>();
    const response = context.switchToHttp().getResponse<{ setHeader(k: string, v: string): void }>();

    // Prefer the authenticated subject; fall back to the socket IP. Only trust
    // x-forwarded-for when TRUST_PROXY is configured (see src/main.ts).
    const subject = request.authUser?.sub ?? request.ip ?? 'anonymous';
    const status = await this.rateLimitService.checkEndpointRateLimit(
      `extension:${subject}:${context.getClass().name}.${context.getHandler().name}`,
    );
    response.setHeader('X-RateLimit-Limit', String(status.limit));
    response.setHeader('X-RateLimit-Remaining', String(status.remaining));
    if (status.isExceeded) {
      throw new HttpException(
        { message: 'Too many requests. Please slow down.', retryAfter: status.retryAfter },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
```

Never keep rate-limit counters only in process memory: they reset on deploy and are useless across
replicas. Always return `429` with `Retry-After`/`X-RateLimit-*` headers; the error body goes
through the canonical envelope with `code: "RATE_LIMITED"`.

## 5. Common vulnerabilities

### 5.1 SQL injection

- All reads/writes go through Prisma; it parameterises values. Use `findMany({ where })`, not string
  concatenation.
- If raw SQL is unavoidable, use tagged templates:
  `prisma.$queryRaw\`SELECT id FROM properties WHERE city = ${city}\``.
  Never `prisma.$queryRawUnsafe(`… ${city} …`)` with untrusted input.
- Do not interpolate user input into delegate names, field names, `orderBy` keys or `include` keys.
  Map them through an allowlist:

```ts
// api-extensions/services/valuation-sort.service.ts
const SORT_FIELDS = ['createdAt', 'estimatedValue', 'confidence'] as const;
type SortField = (typeof SORT_FIELDS)[number];

export function resolveSort(input: string): SortField {
  return SORT_FIELDS.includes(input as SortField) ? (input as SortField) : 'createdAt';
}
```

- Add `take`/`skip` (or cursor pagination) to every list query so an attacker cannot request the
  whole table.

### 5.2 XSS

- Sanitize HTML out of free text on input (`CleanText`, request sanitization interceptor).
- Return JSON with `Content-Type: application/json`; never embed raw user text in HTML emails or
  Swagger descriptions without escaping.
- Keep the CSP and `X-Content-Type-Options: nosniff` headers from §6; they stop stored text from
  executing if a downstream client renders it.

### 5.3 CSRF

- The API authenticates with bearer tokens in the `Authorization` header, not ambient cookies, so
  classic CSRF does not apply. Keep it that way for extensions.
- If an extension must accept cookie-based auth (e.g. a browser-only flow), require
  `SameSite=Strict`, `HttpOnly`, `Secure`, an anti-CSRF token, and an `Origin`/`Referer` allowlist.
- `enableCors()` is **not** CSRF protection: CORS governs reading responses, not sending requests.

### 5.4 Other hazards

| Hazard | Control |
| ------ | ------- |
| Mass assignment | global `whitelist: true`, `forbidNonWhitelisted: true`; never spread `req.body` into Prisma `data` |
| IDOR | resource-owner guard plus `where: { id, ownerId: user.sub }` on the query |
| Log injection | log ids/status codes, not raw bodies; strip `\r\n` from any user value before logging |
| Secrets in errors | no tokens/passwords in `message`, `details`, or stack sent to clients |
| SSRF | allowlist outbound hosts; never fetch a URL supplied by a client without validation |
| PII retention | screening/valuation reports follow the retention policy; avoid copying them into logs/analytics |

## 6. Secure headers and CORS

`src/config/security-headers.ts` (installed globally in `src/main.ts`) and `docs/SECURITY.md`
define the baseline:

```
Content-Security-Policy: default-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'none'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

CORS uses `CORS_ORIGINS` (never `*` in production), `credentials: true`, and an explicit
`allowedHeaders` list. Extensions must not loosen it. If an extension needs one extra header (for
example `API-Version`), register an extension-local middleware that only **adds** missing headers
and never overwrites the global ones:

```ts
// api-extensions/middleware/extension-security-headers.middleware.ts
import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

const HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': "camera=(), microphone=(), geolocation=()",
};

@Injectable()
export class ExtensionSecurityHeadersMiddleware {
  use(_request: Request, response: Response, next: NextFunction): void {
    for (const [name, value] of Object.entries(HEADERS)) {
      if (!response.getHeader(name)) response.setHeader(name, value);
    }
    next();
  }
}
```

Register via `consumer.apply(ExtensionSecurityHeadersMiddleware).forRoutes('extensions/*')` in the
extension module. Do not duplicate CSP or HSTS here – the global middleware owns them.

## 7. PR security checklist

- [ ] Every request DTO uses `class-validator` decorators; no unvalidated `req.body` reaches a service.
- [ ] Free text uses `CleanText`/sanitization interceptor; passwords/tokens are never transformed or echoed.
- [ ] Response DTOs or Prisma `select` enforce a field allowlist; no raw entities in responses.
- [ ] Sensitive screening/PII data has its own authorization path and is absent from logs/snapshots.
- [ ] JWT → roles → scopes → ownership guards are applied in the correct order to every mutation.
- [ ] Write/search endpoints have explicit rate limits and `429` envelopes with rate-limit headers.
- [ ] Prisma queries are parameterised; any raw SQL uses tagged templates; sort keys are allowlisted.
- [ ] List endpoints are paginated and scoped to the authenticated owner/tenant.
- [ ] No `console.log` of bodies, tokens, secrets, credit scores or applicant emails.
- [ ] Security headers/CORS settings are not weakened; `TRUST_PROXY` semantics are respected.
- [ ] Error messages do not reveal account existence, stack traces, SQL or internal IDs to callers.
- [ ] Added tests (under `api-extensions/tests/`) cover unauthorized, forbidden, invalid-input,
      oversized-payload and rate-limited paths.
- [ ] No files outside `api-extensions/` were modified.
