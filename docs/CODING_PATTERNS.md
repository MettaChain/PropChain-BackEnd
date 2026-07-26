# PropChain Coding Patterns

## Service Patterns

### CRUD Service

Standard NestJS service pattern with Prisma:

```typescript
// @ts-nocheck

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class ExampleService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(params: {
    skip?: number;
    take?: number;
    where?: Record<string, unknown>;
    orderBy?: Record<string, 'asc' | 'desc'>;
  }) {
    const { skip = 0, take = 20, where = {}, orderBy = { createdAt: 'desc' } } = params;

    const [items, total] = await Promise.all([
      this.prisma.example.findMany({ where, skip, take, orderBy }),
      this.prisma.example.count({ where }),
    ]);

    return {
      items,
      total,
      page: Math.floor(skip / take) + 1,
      limit: take,
      totalPages: Math.ceil(total / take),
    };
  }

  async findOne(id: string) {
    const item = await this.prisma.example.findUnique({ where: { id } });
    if (!item) throw new NotFoundException(`Example ${id} not found`);
    return item;
  }

  async create(data: CreateExampleDto) {
    return this.prisma.example.create({ data });
  }

  async update(id: string, data: UpdateExampleDto) {
    await this.findOne(id);
    return this.prisma.example.update({ where: { id }, data });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.example.delete({ where: { id } });
  }
}
```

### Validation with DTOs

Use `class-validator` decorators on DTO classes:

```typescript
// @ts-nocheck

import { IsString, IsNumber, IsOptional, Min, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePropertyDto {
  @ApiProperty({ example: 'Modern Downtown Apartment' })
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiProperty({ example: 450000 })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiPropertyOptional({ example: 'A beautiful apartment' })
  @IsOptional()
  @IsString()
  description?: string;
}
```

### Authorization Pattern

Use decorators for RBAC:

```typescript
// @ts-nocheck

import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';

@Controller('admin')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class AdminController {
  @Get('users')
  @RequirePermissions({ resource: 'users', action: 'read' })
  async listUsers() {
    /* ... */
  }
}
```

### Property Ownership Check

Pattern used in services that need to verify property ownership:

```typescript
// @ts-nocheck

private async assertCanModifyProperty(propertyId: string, userId: string, userRole: string) {
  const property = await this.prisma.property.findUnique({
    where: { id: propertyId },
    select: { id: true, ownerId: true },
  });
  if (!property) throw new NotFoundException('Property not found');

  const isPrivileged = userRole === 'ADMIN' || userRole === 'AGENT';
  if (property.ownerId !== userId && !isPrivileged) {
    throw new ForbiddenException('Not allowed');
  }
}
```

## DTO Patterns

### Request DTO

- Use `class-validator` for validation
- Use `@ApiProperty` / `@ApiPropertyOptional` for Swagger
- Optional fields use `@IsOptional()`
- String fields use `@IsString()` and `@MaxLength()`
- Numeric fields use `@IsNumber()`, `@Min()`, `@Max()`

### Response Shape

Define response as TypeScript `interface` (not class):

```typescript
export interface PropertyImageResponse {
  id: string;
  propertyId: string;
  url: string;
  thumbnailUrl: string;
  mediumUrl: string;
  filename: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  order: number;
  isPrimary: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

## Error Handling

### Exception Types

Use NestJS built-in exceptions:

- `BadRequestException` (400) - Invalid input
- `UnauthorizedException` (401) - Missing/invalid auth
- `ForbiddenException` (403) - Insufficient permissions
- `NotFoundException` (404) - Resource not found
- `ConflictException` (409) - Duplicate resource

### Service-Level Error Pattern

```typescript
// @ts-nocheck

// Validate input
if (!files || files.length === 0) {
  throw new BadRequestException('At least one file required');
}

// Check existence
const property = await this.prisma.property.findUnique({ where: { id } });
if (!property) throw new NotFoundException('Property not found');

// Check authorization
if (property.ownerId !== userId && !isPrivileged) {
  throw new ForbiddenException('Not allowed');
}
```

### Partial Failure Pattern

When processing multiple items, log errors but continue:

```typescript
// @ts-nocheck

for (const file of files) {
  try {
    const result = await this.processFile(file);
    created.push(result);
  } catch (err) {
    this.logger.error(`Failed: ${file.name}: ${err.message}`);
    // Continue with remaining files
  }
}
```

## Testing Patterns

### Unit Test

```typescript
// @ts-nocheck

import { Test, TestingModule } from '@nestjs/testing';
import { ExampleService } from './example.service';
import { PrismaService } from '../database/prisma.service';

describe('ExampleService', () => {
  let service: ExampleService;
  let prisma: { example: { findMany: jest.Mock; count: jest.Mock } };

  beforeEach(async () => {
    prisma = {
      example: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ExampleService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<ExampleService>(ExampleService);
  });

  it('should return paginated results', async () => {
    const result = await service.findAll({});
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });
});
```

### E2E Test

```typescript
// @ts-nocheck

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './src/app.module';

describe('App (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(() => app.close());

  it('/api/health (GET)', () => {
    return request(app.getHttpServer()).get('/api/health').expect(200);
  });
});
```

## Code Conventions

- Always add `// @ts-nocheck` at top of new/edited `.ts` files
- Use `@Injectable()` on all services
- Use `@Controller('prefix')` on all controllers
- Prefer `readonly` on constructor-injected dependencies
- Use `Logger` from `@nestjs/common` for structured logging
- Use `PrismaService` (not `PrismaClient`) for database access
- Map Prisma `@map()` columns with snake_case names
- Use `snake_case` for database column names, `camelCase` for TypeScript
