# API Versioning for Extension Endpoints

Issue: #1584 · Target: `api-extensions/docs/`

This guide shows how an extension under `api-extensions/` can expose versioned endpoints, keep old
clients working and retire old shapes safely. The files named under `src/versioning/` are
**read-only references**; every file created by the examples below lives under `api-extensions/`.

## 1. Versioning strategy

The platform currently defines two versions in `src/versioning/api-version.constants.ts`:

| Version | Status                     | Released   | Sunset                       |
| ------- | -------------------------- | ---------- | ---------------------------- |
| `v1`    | deprecated                 | 2026-01-01 | 2026-12-31 (HTTP-date header)|
| `v2`    | active (`DEFAULT_API_VERSION`) | 2026-04-01 | –                        |

`MIN_DEPRECATION_NOTICE_DAYS = 90`; `DEPRECATION_POLICY` also defines warning code `299`, the
migration guide URL and support email. A version whose sunset date has passed is treated as
`sunset` by `resolveEffectiveStatus()` regardless of its stored status.

Three negotiation mechanisms are supported. The resolution order implemented by both
`VersionMiddleware` and `VersionHeaderInterceptor` is:

1. **URL path** – first `/api/(v\d+)/…` match in `request.path`;
2. **Header** – `API-Version: v2` (case-insensitive HTTP header name);
3. **Accept parameter** – `Accept: application/json; version=v2` (regex `version=([^;,\s]+)`);
4. **Default** – `DEFAULT_API_VERSION` (`v2`).

An unsupported version is rejected with `400 BadRequestException`; a sunset version is rejected
similarly. Because URL wins, a client sending `GET /api/v1/...` with `API-Version: v2` is still on
`v1` – never mix signals.

| Strategy | Example | Pros | Cons |
| -------- | ------- | ---- | ---- |
| URL | `/api/v2/extensions/valuations` | cache-friendly, browsable, explicit | routes must be duplicated or parameterised |
| Header | `API-Version: v2` | one URI per resource | invisible in logs/caches unless header is part of cache key |
| Accept | `Accept: application/json; version=v1` | content negotiation semantics | easily lost by proxies; parser only reads `version=` |

**Recommendation for new extensions:** expose the canonical route under `/api/v2/extensions/...`
and keep a thin `/api/v1/extensions/...` alias only while v1 is supported. Accept the header/Accept
forms for clients that cannot change their base URL, but document the precedence above.

## 2. Version routing and middleware

`src/versioning/version.middleware.ts` parses the version, validates it, rejects sunset versions and
sets `request.apiVersion`. It is **not registered globally** in `src/main.ts`, so an extension that
needs strict per-route enforcement applies it itself with `MiddlewareConsumer` (no core edits).

```ts
// api-extensions/middleware/extension-version.middleware.ts
import { BadRequestException, Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

declare module 'express' {
  interface Request {
    apiVersion?: 'v1' | 'v2';
  }
}

@Injectable()
export class ExtensionVersionMiddleware implements NestMiddleware {
  use(request: Request, _response: Response, next: NextFunction): void {
    const urlVersion = request.path.match(/\/api\/(v\d+)\//)?.[1];
    const headerVersion = request.headers['api-version'];
    const acceptVersion = String(request.headers['accept'] ?? '').match(/version=([^;,\s]+)/)?.[1];
    const version = urlVersion ?? headerVersion ?? acceptVersion ?? 'v2';

    if (version !== 'v1' && version !== 'v2') {
      // The global HttpExceptionFilter renders this through the canonical
      // error envelope (see error-handling-and-i18n.md).
      next(new BadRequestException(`Unsupported API version: ${version}`));
      return;
    }

    request.apiVersion = version;
    next();
  }
}
```

Register it only for extension routes:

```ts
// api-extensions/modules/extension-valuations/extension-valuations.module.ts
import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ExtensionVersionMiddleware } from '../../middleware/extension-version.middleware';
import { ExtensionValuationsController } from './extension-valuations.controller';
import { ExtensionValuationsService } from './extension-valuations.service';

@Module({
  controllers: [ExtensionValuationsController],
  providers: [ExtensionValuationsService],
})
export class ExtensionValuationsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(ExtensionVersionMiddleware)
      .forRoutes(
        { path: 'api/v1/extensions/valuations', method: RequestMethod.ALL },
        { path: 'api/v2/extensions/valuations', method: RequestMethod.ALL },
      );
  }
}
```

Other building blocks worth reusing (read-only):

- `src/versioning/version.guard.ts` – reads `@ApiVersion(...)` metadata and fails when the request
  version is not listed. Apply it to a single controller with `@UseGuards(VersionGuard)`.
- `src/versioning/get-version.decorator.ts` – `@GetVersion() version: ApiVersionEnum` injects the
  resolved version into a handler without reading headers manually.
- `src/versioning/version-header.interceptor.ts` – global; sets `API-Version`,
  `API-Version-Status`, deprecation headers and increments version metrics.
- `src/versioning/version-routing.service.ts` – `versionedResponse(data, version)` wraps data as
  `{ apiVersion, data, timestamp }` when a wrapped shape is wanted.

## 3. Deprecation warnings

`src/versioning/deprecation-warning.interceptor.ts` is global. It reads `@ApiVersion()` and
`@Deprecated()` metadata from the handler and adds RFC 8594 / 7234 headers:

```
Deprecation: true
Sunset: Thu, 31 Dec 2026 00:00:00 GMT
Warning: 299 - "Use /api/v2/extensions/valuations instead"
X-Deprecation-Message: ...
X-Sunset-Days-Remaining: 42
Link: <https://docs.propchain.io/v1>; rel="sunset"
X-Migration-Guide: https://docs.propchain.io/migration
```

Once a version's sunset date passes, the interceptor throws `GoneException` (410). Always give at
least 90 days' notice (`MIN_DEPRECATION_NOTICE_DAYS`) before adding a sunset date to a new version.

```ts
// api-extensions/modules/extension-valuations/extension-valuations.controller.ts
import {
  ApiVersion,
  Deprecated,
} from '../../../src/versioning/api-version.decorator'; // read-only core import
import { ApiVersionEnum } from '../../../src/versioning/api-version.constants'; // read-only

@Deprecated('Use the v2 valuation detail endpoint instead')
@Get('v1/:id')
@ApiVersion(ApiVersionEnum.V1)
legacyFindOne(@Param('id') id: string) {
  return this.service.findById(id, ApiVersionEnum.V1);
}
```

Do not emit your own `Deprecation` header in an extension – the global interceptor already owns it.
Do not shorten the notice window or return `410` for a version that is merely deprecated.

## 4. Backward-compatibility service patterns

`src/versioning/backward-compatibility.service.ts` is global and injectable. It keeps a registry of
`entityType → transformer` functions and exposes:

- `transform(data, from, to, entityType)` – converts single objects or arrays;
- `registerV2ToV1Transformer(entityType, fn)` / `registerV1ToV2Transformer(...)`;
- `filterFieldsByVersion(obj, version, entityType)` and `fieldExistsInVersion(...)`.

Register extension transformers once at module startup, then call the service from the service
layer rather than branching on version inside controllers.

```ts
// api-extensions/services/valuation-compatibility.service.ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  ApiVersionEnum,
} from '../../src/versioning/api-version.constants'; // read-only core import
import {
  BackwardCompatibilityService,
} from '../../src/versioning/backward-compatibility.service'; // read-only core import

interface ValuationV2 {
  id: string;
  propertyId: string;
  estimatedValue: number;
  confidence: number;
  valuationDate: string;
  metadata?: { method?: string; source?: string };
}

@Injectable()
export class ValuationCompatibilityService implements OnModuleInit {
  constructor(private readonly compatibility: BackwardCompatibilityService) {}

  onModuleInit(): void {
    // v1 never knew about `confidence`, `valuationDate` or `metadata`.
    this.compatibility.registerV2ToV1Transformer('extension-valuation', (data: ValuationV2) => ({
      id: data.id,
      propertyId: data.propertyId,
      estimatedValue: data.estimatedValue,
    }));
  }

  present<T>(data: T, version: ApiVersionEnum): T {
    return this.compatibility.transform(
      data,
      ApiVersionEnum.V2,
      version,
      'extension-valuation',
    );
  }
}
```

Compatibility rules:

1. **Additive changes** need no version bump: new optional response fields are safe for v2 clients;
   v1 transformers strip them.
2. **Breaking changes** (rename, type change, removal, changed validation) require a new version or
   a new endpoint path.
3. Transform from the **newest canonical shape** to the old one; never query two different data
   sources per version.
4. Keep transformers pure and symmetric where possible; one transformer per `entityType`.
5. Request DTOs also need compatibility: accept the old field name in the v1 DTO and map it once in
   the service, rather than sprinkling `if (version === 'v1')` through business logic.

## 5. Version-specific DTOs and response shapes

Keep each wire contract in its own file under `api-extensions/dto/`. Derive v1 from v2 by explicit
field selection (not by inheritance that accidentally leaks new fields).

```ts
// api-extensions/dto/v2/valuation-response.v2.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ValuationResponseV2Dto {
  @ApiProperty() id: string;
  @ApiProperty() propertyId: string;
  @ApiProperty({ description: 'Estimated value in USD' }) estimatedValue: number;
  @ApiProperty({ minimum: 0, maximum: 100 }) confidence: number;
  @ApiProperty() valuationDate: string;
  @ApiPropertyOptional() metadata?: { method?: string; source?: string };
}
```

```ts
// api-extensions/dto/v1/valuation-response.v1.dto.ts
import { ApiProperty } from '@nestjs/swagger';

export class ValuationResponseV1Dto {
  @ApiProperty() id: string;
  @ApiProperty() propertyId: string;
  @ApiProperty() estimatedValue: number;
}
```

```ts
// api-extensions/dto/v1/create-valuation.v1.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateValuationV1Dto {
  @ApiProperty() @IsUUID() propertyId: string;

  /** v1 called this field `value`. */
  @ApiProperty() @IsNumber() @Min(0) value: number;

  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}
```

```ts
// api-extensions/dto/v2/create-valuation.v2.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class CreateValuationV2Dto {
  @ApiProperty() @IsUUID() propertyId: string;

  @ApiProperty() @IsNumber() @Min(0) estimatedValue: number;

  @ApiProperty({ minimum: 0, maximum: 100 })
  @IsInt()
  @Min(0)
  @Max(100)
  confidence: number;

  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}
```

Map the legacy request shape once:

```ts
// api-extensions/services/valuation-request.mapper.ts
import { CreateValuationV1Dto } from '../dto/v1/create-valuation.v1.dto';
import { CreateValuationV2Dto } from '../dto/v2/create-valuation.v2.dto';

export function toV2Create(dto: CreateValuationV1Dto | CreateValuationV2Dto): CreateValuationV2Dto {
  if ('value' in dto) {
    return {
      propertyId: dto.propertyId,
      estimatedValue: dto.value,
      confidence: 70, // v1 clients did not submit a confidence score
      ...(dto.notes ? { notes: dto.notes } : {}),
    };
  }
  return dto;
}
```

## 6. Complete versioned endpoint example

```ts
// api-extensions/services/extension-valuations.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ApiVersionEnum,
} from '../../src/versioning/api-version.constants'; // read-only core import
import { ValuationCompatibilityService } from './valuation-compatibility.service';
import { ValuationResponseV2Dto } from '../dto/v2/valuation-response.v2.dto';

interface ValuationEntity {
  id: string;
  propertyId: string;
  estimatedValue: number;
  confidence: number;
  valuationDate: string;
  metadata?: { method?: string; source?: string };
}

@Injectable()
export class ExtensionValuationsService {
  // In a real extension this would come from PrismaService; the shape below
  // is the canonical (v2) stored form.
  private readonly records: ValuationEntity[] = [
    {
      id: '4a1e9f28-0000-4000-8000-000000000001',
      propertyId: '5b2f0a39-0000-4000-8000-000000000002',
      estimatedValue: 742500,
      confidence: 88,
      valuationDate: '2026-11-01T00:00:00.000Z',
      metadata: { method: 'comparable-sales', source: 'extension-seed' },
    },
  ];

  constructor(private readonly compatibility: ValuationCompatibilityService) {}

  findById(id: string, version: ApiVersionEnum): ValuationResponseV2Dto | unknown {
    const record = this.records.find((item) => item.id === id);
    if (!record) {
      // The global HttpExceptionFilter renders a localized 404 envelope;
      // see error-handling-and-i18n.md for domain-specific overrides.
      throw new NotFoundException(`Valuation ${id} not found`);
    }
    return this.compatibility.present(record, version);
  }
}
```

```ts
// api-extensions/modules/extension-valuations/extension-valuations.controller.ts
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  ApiVersionEnum,
} from '../../../src/versioning/api-version.constants'; // read-only core import
import {
  ApiVersion,
  Deprecated,
} from '../../../src/versioning/api-version.decorator'; // read-only core import
import { GetVersion } from '../../../src/versioning/get-version.decorator'; // read-only core import
import { VersionGuard } from '../../../src/versioning/version.guard'; // read-only core import
import { CreateValuationV1Dto } from '../../dto/v1/create-valuation.v1.dto';
import { CreateValuationV2Dto } from '../../dto/v2/create-valuation.v2.dto';
import { toV2Create } from '../../services/valuation-request.mapper';
import { ExtensionValuationsService } from '../../services/extension-valuations.service';

@ApiTags('Extension Valuations')
@UseGuards(VersionGuard)
@Controller()
export class ExtensionValuationsController {
  constructor(private readonly service: ExtensionValuationsService) {}

  @Get('api/v2/extensions/valuations/:id')
  @ApiVersion(ApiVersionEnum.V2)
  @ApiOperation({ summary: 'Valuation detail, v2 shape' })
  @ApiResponse({ status: 200, type: Object })
  findV2(@Param('id') id: string, @GetVersion() version: ApiVersionEnum) {
    return this.service.findById(id, version);
  }

  @Get('api/v1/extensions/valuations/:id')
  @ApiVersion(ApiVersionEnum.V1)
  @Deprecated('Use GET /api/v2/extensions/valuations/:id instead')
  @ApiOperation({ summary: 'Valuation detail, legacy v1 shape' })
  findV1(@Param('id') id: string) {
    return this.service.findById(id, ApiVersionEnum.V1);
  }

  @Post('api/v2/extensions/valuations')
  @ApiVersion(ApiVersionEnum.V2)
  createV2(@Body() dto: CreateValuationV2Dto) {
    return { apiVersion: ApiVersionEnum.V2, data: dto };
  }

  @Post('api/v1/extensions/valuations')
  @ApiVersion(ApiVersionEnum.V1)
  @Deprecated('Use POST /api/v2/extensions/valuations instead')
  createV1(@Body() dto: CreateValuationV1Dto) {
    return { apiVersion: ApiVersionEnum.V1, data: toV2Create(dto) };
  }
}
```

Behaviour:

- `GET /api/v2/extensions/valuations/…` → `{ id, propertyId, estimatedValue, confidence,
  valuationDate, metadata }` plus `API-Version: v2` header.
- `GET /api/v1/extensions/valuations/…` → `{ id, propertyId, estimatedValue }` plus
  `Deprecation`, `Sunset`, `Warning: 299 - "…"` and `Link` headers.
- `GET /api/v3/extensions/valuations/…` → `400` from version validation; a v1 request after
  `2026-12-31` → `410 Gone`.

## 7. Version snapshot testing

Snapshot the **wire contract**, not the internal entity. Keep snapshots under
`api-extensions/tests/__snapshots__/` and assert both the body and the version headers. Illustrative
Jest snippet (no test file is created by this guide):

```ts
// api-extensions/tests/valuation-version.snapshot.spec.ts (illustrative)
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { ExtensionValuationsModule } from '../modules/extension-valuations/extension-valuations.module';

describe('valuation version snapshots', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ExtensionValuationsModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => app.close());

  const id = '4a1e9f28-0000-4000-8000-000000000001';

  it('keeps the v1 response shape frozen', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/extensions/valuations/${id}`)
      .expect(200);

    expect(res.body).toEqual({
      id,
      propertyId: expect.any(String),
      estimatedValue: expect.any(Number),
    });
    expect(res.headers['api-version']).toBe('v1');
    expect(res.headers['deprecation']).toBe('true');
    expect(res.headers['sunset']).toBeDefined();
    expect(res.body).toMatchSnapshot();
  });

  it('exposes the full v2 response shape', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v2/extensions/valuations/${id}`)
      .expect(200);

    expect(res.body).toMatchObject({
      id,
      confidence: expect.any(Number),
      valuationDate: expect.any(String),
    });
    expect(res.headers['api-version']).toBe('v2');
    expect(res.body).not.toHaveProperty('deprecationInfo');
    expect(res.body).toMatchSnapshot();
  });
});
```

When a breaking change is intentional, update the **new** version's snapshot and add a new snapshot
for the old version; never silently regenerate both. Also test header/Accept negotiation on one
canonical route to guarantee precedence stays unchanged.

## 8. Review checklist

- [ ] New endpoints are mounted under a supported version path (`v2` today).
- [ ] Version is resolved once (middleware/global interceptor) and read via `@GetVersion()` or
      `request.apiVersion` – no ad-hoc header parsing in services.
- [ ] `@ApiVersion()` metadata is present on every versioned handler; legacy handlers also carry
      `@Deprecated()`.
- [ ] At least 90 days of deprecation notice before a sunset date.
- [ ] v1 DTOs accept legacy fields and map them centrally; v2 DTOs validate the canonical shape.
- [ ] Transformers are registered once (`OnModuleInit`) and keep the old response shape byte-for-byte.
- [ ] Snapshots cover request DTO mapping, response bodies and version/deprecation headers.
- [ ] No core `src/versioning/*` file was edited from the extension.
