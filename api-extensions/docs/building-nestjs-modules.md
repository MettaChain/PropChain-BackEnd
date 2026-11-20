# Building NestJS Modules in `api-extensions/`

This guide shows how to add a self-contained NestJS module under `api-extensions/modules/`. It follows the conventions in `docs/CODING_PATTERNS.md` and the module shapes used by `src/investments/` (smallest example: one controller, one service, `PrismaModule`) and `src/transactions/` (larger example: several controllers/services, `PrismaModule`, `CacheModuleConfig`, notifications, etc.). Nothing in `src/` is modified — those folders are read-only references.

## 1. Isolation principle and import rules

`api-extensions/` exists because the core codebase is being refactored. Every file you add must live inside this folder.

**Allowed**

- New files under `api-extensions/modules/<feature-name>/`, `api-extensions/dto/`, `api-extensions/services/`, `api-extensions/guards/`, etc.
- Importing shared *providers* read-only from the main codebase with a relative path, e.g. `PrismaService`, `CacheService`, `PrismaModule`, `CacheModuleConfig`.
- Reusing existing decorators/utilities read-only, e.g. `JwtAuthGuard`, `RolesGuard`, `CleanText`.

**Not allowed**

- Editing `src/`, `prisma/`, `test/`, root config, `package.json`, or shared indexes (`api-extensions/README.md`, barrel files owned by other agents).
- Assuming you can change the Prisma schema. Adapt to existing models and fields; if none fit, use an in-memory/dto-only service as the commission-split module does and document the limitation.

From `api-extensions/modules/<feature>/` the path to a shared file in `src/` is `../../../src/...` (one `..` to `modules/`, two to `api-extensions/`, three to the repo root). From `api-extensions/guards/` or `api-extensions/dto/` it is `../../src/...`. Keep this boundary explicit in code review: imports may cross into `src/`, edits may not.

## 2. Folder and file layout

```
api-extensions/modules/example-listing/
├── dto/
│   └── example-listing.dto.ts        # request/response DTOs
├── example-listing.controller.ts     # HTTP routes + Swagger metadata
├── example-listing.service.ts        # business logic, Prisma/cache access
├── example-listing.service.spec.ts   # unit tests (illustrative in this guide)
└── example-listing.module.ts         # DI wiring
```

Use kebab-case folder/file names, `@Controller('example-listings')` (plural, kebab-case), and one feature per module. Export the service from the module if another extension needs it.

### `api-extensions/modules/example-listing/example-listing.module.ts`

```ts
// @ts-nocheck
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../src/database/prisma.module';
import { CacheModuleConfig } from '../../../src/cache/cache.module';
import { ExampleListingController } from './example-listing.controller';
import { ExampleListingService } from './example-listing.service';

@Module({
  imports: [PrismaModule, CacheModuleConfig],
  controllers: [ExampleListingController],
  providers: [ExampleListingService],
  exports: [ExampleListingService],
})
export class ExampleListingModule {}
```

- `src/investments/investments.module.ts` imports only `PrismaModule`; copy that when no cache/notifications are needed.
- `src/transactions/transactions.module.ts` imports several modules and exports multiple services; copy that shape for larger features.
- `CacheModuleConfig` is declared `@Global()` in the core app, but importing it explicitly keeps isolated `TestingModule` setups working.
- Guards used only here go in `providers` (see `api-extensions/docs/guards-and-authorization.md`); global guards use `APP_GUARD`.

## 3. Controller: routing and Swagger

```ts
// @ts-nocheck
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ExampleListingService } from './example-listing.service';
import {
  CreateExampleListingDto,
  ExampleListingDto,
  ListExampleListingsQueryDto,
  UpdateExampleListingDto,
} from './dto/example-listing.dto';

@ApiTags('example-listings')
@Controller('example-listings')
export class ExampleListingController {
  constructor(private readonly service: ExampleListingService) {}

  @Post()
  @ApiOperation({ summary: 'Create an example listing' })
  @ApiCreatedResponse({ type: ExampleListingDto })
  create(@Body() dto: CreateExampleListingDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List example listings (paginated)' })
  @ApiOkResponse({ type: [ExampleListingDto] })
  findAll(@Query() query: ListExampleListingsQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one example listing' })
  @ApiOkResponse({ type: ExampleListingDto })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an example listing' })
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateExampleListingDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an example listing' })
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.remove(id);
  }
}
```

Rules of thumb:

- The global `ValidationPipe` in the core bootstrap handles DTOs in production; in isolated E2E setups add `new ValidationPipe({ transform: true, whitelist: true })` to the testing app (see section 6).
- `@Param('id', new ParseUUIDPipe())` rejects malformed ids before the service, matching `api-extensions/modules/commission-split/commission-split.controller.ts`.
- Static routes must be declared before parametric ones (`@Get('health')` before `@Get(':id')`) — `src/investments/investments.controller.ts` shows this ordering.
- `@ApiProperty` on DTO fields feeds the Swagger schemas referenced by `@ApiCreatedResponse({ type: ... })`; see `api-extensions/docs/dto-validation-patterns.md`.
- Guards are attached with `@UseGuards(JwtAuthGuard, RolesGuard)` (authentication first) or per-route via a custom metadata decorator.

## 4. Service: dependency injection, Prisma, cache, errors

```ts
// @ts-nocheck
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../src/database/prisma.service';
import { CacheService } from '../../../src/cache/cache.service';
import { CACHE_TTL } from '../../../src/cache/cache.config';
import { CacheOperationStatus } from '../../../src/cache/cache.types';
import { CreateExampleListingDto, ExampleListingDto, UpdateExampleListingDto } from './dto/example-listing.dto';

@Injectable()
export class ExampleListingService {
  private readonly logger = new Logger(ExampleListingService.name);
  private readonly cachePrefix = 'example-listing:';

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async create(dto: CreateExampleListingDto): Promise<ExampleListingDto> {
    const duplicate = await this.prisma.exampleListing.findFirst({
      where: { title: dto.title },
      select: { id: true },
    });
    if (duplicate) throw new ConflictException('Example listing title already exists');

    const created = await this.prisma.exampleListing.create({ data: dto });
    this.logger.log(`Created example listing ${created.id}`);
    return created;
  }

  async findAll(params: { skip?: number; take?: number } = {}): Promise<ExampleListingDto[]> {
    const { skip = 0, take = 20 } = params;
    // Select only the fields the response needs; see docs/CODING_PATTERNS.md.
    return this.prisma.exampleListing.findMany({
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, price: true, createdAt: true },
    });
  }

  async findOne(id: string): Promise<ExampleListingDto> {
    const key = `${this.cachePrefix}${id}`;
    const cached = await this.cache.get<ExampleListingDto>(key);
    if (cached.status === CacheOperationStatus.SUCCESS && cached.data) {
      return cached.data;
    }

    const record = await this.prisma.exampleListing.findUnique({
      where: { id },
      select: { id: true, title: true, price: true, createdAt: true },
    });
    if (!record) throw new NotFoundException(`Example listing ${id} not found`);

    // CacheService swallows cache failures and returns a result envelope, so a
    // Redis outage never breaks the request path.
    await this.cache.set(key, record, CACHE_TTL.SHORT);
    return record;
  }

  async update(id: string, dto: UpdateExampleListingDto): Promise<ExampleListingDto> {
    await this.findOne(id); // 404 before attempting the write
    if (dto.price !== undefined && dto.price < 0) {
      throw new BadRequestException('Price cannot be negative');
    }
    const updated = await this.prisma.exampleListing.update({ where: { id }, data: dto });
    await this.cache.del(`${this.cachePrefix}${id}`);
    return updated;
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.prisma.exampleListing.delete({ where: { id } });
    await this.cache.del(`${this.cachePrefix}${id}`);
  }
}
```

Notes:

- Inject through the constructor and mark dependencies `readonly`. `PrismaService` (never a raw `PrismaClient`) is the convention in `docs/CODING_PATTERNS.md`.
- `CacheService.get()` returns `{ status, data? }`; use `CacheOperationStatus.SUCCESS`. Invalidating on writes prevents stale reads.
- Throw NestJS exceptions, not plain `Error`: `BadRequestException` 400, `UnauthorizedException` 401, `ForbiddenException` 403, `NotFoundException` 404, `ConflictException` 409. See `src/investments/investments.service.ts` for the minimal find-or-404 pattern.
- Validate business invariants that DTOs cannot express (e.g. "percentages total 100") in the service too; `api-extensions/modules/commission-split/commission-split.service.ts` does this with `BadRequestException`.
- Define response shapes as TypeScript `interface`s (or DTO classes with `@ApiProperty` if Swagger needs them), use `camelCase` in TypeScript and let Prisma map `snake_case` columns.

## 5. DTO file (summary)

Keep request/response DTOs in `dto/` next to the module (or in the shared `api-extensions/dto/` when reused). A minimal shape:

```ts
// @ts-nocheck
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateExampleListingDto {
  @ApiProperty({ example: 'Harbour View' })
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiProperty({ example: 450000 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price: number;
}

export class ExampleListingDto {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiProperty() price: number;
  @ApiProperty() createdAt: Date;
}

export class ListExampleListingsQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  skip?: number = 0;

  @ApiPropertyOptional({ minimum: 1, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  take?: number = 20;
}

export class UpdateExampleListingDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price?: number;
}
```

The full decorator/sanitization/custom-validator guide is `api-extensions/docs/dto-validation-patterns.md`.

## 6. Testing examples (markdown snippets only)

### Service unit test — `api-extensions/modules/example-listing/example-listing.service.spec.ts`

```ts
// @ts-nocheck
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CacheOperationStatus } from '../../../src/cache/cache.types';
import { PrismaService } from '../../../src/database/prisma.service';
import { CacheService } from '../../../src/cache/cache.service';
import { ExampleListingService } from './example-listing.service';

describe('ExampleListingService', () => {
  let service: ExampleListingService;
  const prisma = {
    exampleListing: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
  const cache = {
    get: jest.fn().mockResolvedValue({ status: CacheOperationStatus.MISS }),
    set: jest.fn(),
    del: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExampleListingService,
        { provide: PrismaService, useValue: prisma },
        { provide: CacheService, useValue: cache },
      ],
    }).compile();
    service = module.get(ExampleListingService);
  });

  it('throws 404 for an unknown id', async () => {
    prisma.exampleListing.findUnique.mockResolvedValue(null);
    await expect(service.findOne('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('falls back to Prisma on a cache miss', async () => {
    const record = { id: 'id-1', title: 'Harbour View', price: 450000 };
    prisma.exampleListing.findUnique.mockResolvedValue(record);
    await expect(service.findOne('id-1')).resolves.toEqual(record);
    expect(cache.set).toHaveBeenCalledWith('example-listing:id-1', record, expect.any(Number));
  });
});
```

### Controller E2E shape — `api-extensions/tests/example-listing.e2e.spec.ts`

```ts
// @ts-nocheck
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { PrismaModule } from '../../src/database/prisma.module';
import { CacheModuleConfig } from '../../src/cache/cache.module';
import { ExampleListingController } from '../modules/example-listing/example-listing.controller';
import { ExampleListingService } from '../modules/example-listing/example-listing.service';

let app: INestApplication;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [PrismaModule, CacheModuleConfig],
    controllers: [ExampleListingController],
    providers: [ExampleListingService],
  }).compile();

  app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  await app.init();
});

afterAll(() => app.close());

it('POST /example-listings → 201', async () => {
  await request(app.getHttpServer())
    .post('/example-listings')
    .send({ title: 'Harbour View', price: 450000 })
    .expect(201);
});
```

For pure unit-style E2E, mock the providers instead of importing `PrismaModule`/`CacheModuleConfig`, as done in `test/e2e/transaction-lifecycle.e2e.spec.ts`. See `api-extensions/docs/testing-strategies.md` (if present) and the existing `api-extensions/tests/` fixtures for reusable data.

## 7. Checklist before opening a PR

- [ ] All new files are under `api-extensions/`; no `src/`, `prisma/`, `test/` or root file changed.
- [ ] Module has `@Module({ controllers, providers, exports })`, service has `@Injectable()`, controller has `@Controller()`.
- [ ] Prisma/cache injected via constructor; `@ApiTags`, `@ApiOperation`, `@ApiProperty` present for Swagger.
- [ ] Domain errors use NestJS exceptions; lists are paginated; writes invalidate caches.
- [ ] Tests accompany the module where permitted by project instructions; `git diff --check` is clean.
