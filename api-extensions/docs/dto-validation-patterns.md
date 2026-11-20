# DTO Validation Patterns in `api-extensions/`

This guide covers request DTOs built with `class-validator` and `class-transformer` under `api-extensions/dto/` (or a module-local `dto/` folder). The reference implementation is `src/transactions/dto/transaction.dto.ts` — it combines `@ApiProperty`, `@Type`, `@Transform(CleanText)`, enums and nested DTOs. The sanitizer is `src/auth/sanitize.util.ts`. Both are read-only references; all example files below live under `api-extensions/`.

## 1. Where validation happens

The core app installs a global `ValidationPipe`. In isolated extension tests, add it explicitly:

```ts
app.useGlobalPipes(
  new ValidationPipe({
    transform: true, // required for @Type()/@Transform() to run
    whitelist: true, // drop properties without decorators
    forbidNonWhitelisted: false,
  }),
);
```

Flow: JSON body → `plainToInstance` (`@Type` / `@Transform`) → `class-validator` checks → controller → service. A DTO failure becomes a 400 before the service is called. Business rules that span fields or need the database (e.g. "split percentages total 100%") can be a custom class-level validator *and* an explicit service check — the commission-split service keeps its own `BadRequestException` check as defense in depth.

## 2. `class-validator` decorator reference

| Decorator | Use | Example from the codebase |
|-----------|-----|---------------------------|
| `@IsString()` | Text fields; pair with `@MaxLength(n)` | `title` in `docs/CODING_PATTERNS.md` |
| `@IsNumber()` | Numeric fields; pair with `@Min` / `@Max` | `amount` in `src/transactions/dto/transaction.dto.ts` |
| `@IsEnum(Enum)` | Closed value sets | `type: TransactionTypeDto` |
| `@IsIn([...])` | Closed string sets without an enum | `escrowStatus` in `transaction.dto.ts` |
| `@IsUUID()` | Id fields | `propertyId`, `buyerId` |
| `@IsDate()` | Dates after `@Type(() => Date)` | `startDate` in `TransactionAnalyticsQueryDto` |
| `@IsArray()` + `@ArrayMinSize(1)` | Non-empty collections | `participants` in `api-extensions/modules/commission-split/dto/commission-split.dto.ts` |
| `@IsOptional()` | Optional fields (skips other validators on `null`/`undefined`) | `notes?` |
| `@Min(n)` / `@Max(n)` | Numeric bounds | `splitPercentage` 0–100 |
| `@MaxLength(n)` | String bounds | descriptions, notes |
| `@ValidateNested({ each: true })` | Validate items of an array | `participants[]` |
| `@IsObject()` | Structured metadata | `metadata` in `api-extensions/dto/property-valuation.dto.ts` |

Decorator order on a field is conventional: Swagger metadata first, then transform, then validators. Example:

```ts
@ApiProperty({ example: 450000 })
@Type(() => Number)
@IsNumber()
@Min(0)
amount: number;
```

## 3. `class-transformer`: `@Type()` and `@Transform()`

- `@Type(() => Number)` — query strings and JSON numeric strings become numbers *before* `@IsNumber()`.
- `@Type(() => Date)` — ISO strings become `Date` instances before `@IsDate()`.
- `@Type(() => NestedDto)` — required for `@ValidateNested()`; without it the nested value is a plain object and its decorators never run.
- `@Transform(callback)` — run a custom function during transformation. It can receive `TransformFnParams` (`{ value, obj, ... }`).

```ts
// @ts-nocheck
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import { IsArray, IsDate, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class SearchQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ description: 'ISO date string' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) =>
    Array.isArray(value) ? value.map((item) => String(item).trim()) : value,
  )
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
```

Remember: transformation only runs when the pipe has `transform: true`; otherwise `@Type` is ignored and validation fails with confusing type errors.

## 4. Input sanitization with `CleanText`

`src/auth/sanitize.util.ts` exports:

- `sanitizeIdentifier(value)` → NFKC normalize, remove C0/C1 control characters, trim. Safe for emails/ids.
- `sanitizeText(value)` → identifier cleanup plus HTML tag removal and whitespace collapsing.
- `TrimIdentifier` / `CleanText` → the `TransformFnParams` callback form used with `@Transform`.

Import from an extension DTO as `../../src/auth/sanitize.util` (from `api-extensions/dto/`). Use it **before** string validation so the cleaned value is what gets checked and persisted:

```ts
// @ts-nocheck
import { Transform } from 'class-transformer';
import { CleanText } from '../../src/auth/sanitize.util';

@ApiPropertyOptional({ description: 'Notes shown to agents' })
@IsOptional()
@Transform(CleanText)
@IsString()
@MaxLength(1000)
notes?: string;
```

Never sanitize passwords, tokens or signatures: mutating a secret changes its meaning. Sanitize free text and identifiers, and keep raw values for cryptographic fields.

## 5. Custom validation decorators

Use `registerDecorator` for reusable rules. This class-level validator asserts a `participants[]` array totals 100% — the rule the commission-split E2E fixtures exercise (`api-extensions/tests/fixtures/commission-split.fixtures.ts`).

```ts
// api-extensions/dto/is-percent-total.validator.ts
// @ts-nocheck
import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'isPercentTotal', async: false })
export class IsPercentTotalConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const field = String(args.constraints[0] ?? 'participants');
    const list = (args.object as Record<string, unknown>)[field];
    if (!Array.isArray(list)) return false;

    const total = list.reduce((sum: number, item: any) => {
      const percentage = Number(item?.splitPercentage ?? 0);
      return sum + (Number.isFinite(percentage) ? percentage : 0);
    }, 0);
    return Math.abs(total - 100) <= 0.001; // same tolerance as the commission service
  }

  defaultMessage(args: ValidationArguments): string {
    return `${String(args.constraints[0] ?? 'participants')} must total 100%`;
  }
}

export function IsPercentTotal(field = 'participants', options?: ValidationOptions) {
  return (object: object, propertyName: string): void => {
    registerDecorator({
      name: 'isPercentTotal',
      target: object.constructor,
      propertyName,
      options,
      constraints: [field],
      validator: IsPercentTotalConstraint,
    });
  };
}
```

Usage on a DTO class:

```ts
@IsPercentTotal('participants', { message: 'Commission split percentages must total 100%' })
export class CreateSplitDto {
  // ...participants: ParticipantDto[]
}
```

A property-level validator follows the same pattern with `propertyName` set to the decorated field; use it for single-value rules (e.g. `@IsValidCurrencyCode()`). Keep validators pure and synchronous unless they genuinely need async lookups — database-dependent checks belong in the service or a Prisma-backed guard.

## 6. Nested DTO validation

```ts
// @ts-nocheck
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

class ParticipantDto {
  @ApiProperty()
  @IsUUID()
  userId: string;

  @ApiProperty()
  @IsString()
  role: string;

  @ApiProperty({ minimum: 0, maximum: 100 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  splitPercentage: number;
}

class CreateSplitDto {
  @ApiProperty({ type: [ParticipantDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true }) // validate every element
  @Type(() => ParticipantDto) // ...after converting plain objects
  participants: ParticipantDto[];
}
```

Use `@ValidateNested()` without `each: true` for a single nested object. Remember to annotate both the nested DTO and the parent field for Swagger (`type: [ParticipantDto]`).

## 7. Swagger metadata with `@ApiProperty`

- `@ApiProperty()` — required field; describe it with `{ description, example, enum, minimum, maximum }`.
- `@ApiPropertyOptional()` — optional field; also mark it `@IsOptional()`.
- `@ApiProperty({ enum: MyEnum })` — renders a dropdown; pair with `@IsEnum(MyEnum)`.
- `@ApiProperty({ type: [NestedDto] })` — array of nested schemas.
- Response DTOs get `@ApiProperty` too so `@ApiOkResponse({ type: ... })` in controllers generates useful docs.

```ts
export enum SplitStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  PAID = 'PAID',
  DISPUTED = 'DISPUTED',
}

class SplitResponseDto {
  @ApiProperty({ enum: SplitStatus })
  status: SplitStatus;

  @ApiProperty({ type: [ParticipantDto] })
  participants: ParticipantDto[];
}
```

## 8. Complete example

```ts
// api-extensions/dto/extension-commission-instructions.dto.ts
// @ts-nocheck
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CleanText } from '../../src/auth/sanitize.util';
import { IsPercentTotal } from './is-percent-total.validator';

export enum ExtensionCommissionStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  PAID = 'PAID',
  DISPUTED = 'DISPUTED',
}

export class ExtensionCommissionParticipantDto {
  @ApiProperty({ description: 'Agent user id', example: '11111111-1111-4111-b111-111111111111' })
  @IsUUID()
  userId: string;

  @ApiProperty({ example: 'LISTING_AGENT' })
  @Transform(CleanText)
  @IsString()
  @MaxLength(50)
  role: string;

  @ApiProperty({ description: 'Share of the commission', minimum: 0, maximum: 100, example: 60 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  splitPercentage: number;
}

@IsPercentTotal('participants', { message: 'Commission split percentages must total 100%' })
export class CreateExtensionCommissionDto {
  @ApiProperty({ description: 'Owning transaction id' })
  @IsUUID()
  transactionId: string;

  @ApiProperty({ minimum: 0, example: 10000 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  totalAmount: number;

  @ApiProperty({ type: [ExtensionCommissionParticipantDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ExtensionCommissionParticipantDto)
  participants: ExtensionCommissionParticipantDto[];

  @ApiPropertyOptional({ description: 'Internal note; HTML is stripped' })
  @IsOptional()
  @Transform(CleanText)
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class UpdateExtensionCommissionDto {
  @ApiPropertyOptional({ enum: ExtensionCommissionStatus })
  @IsOptional()
  @IsEnum(ExtensionCommissionStatus)
  status?: ExtensionCommissionStatus;

  @ApiPropertyOptional({ description: 'Signed amount applied to the commission total' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  adjustment?: number;
}

export class ExtensionCommissionResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() transactionId: string;
  @ApiProperty() totalAmount: number;
  @ApiProperty({ enum: ExtensionCommissionStatus }) status: ExtensionCommissionStatus;
  @ApiProperty({ type: [ExtensionCommissionParticipantDto] })
  participants: ExtensionCommissionParticipantDto[];
  @ApiPropertyOptional() notes?: string;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}
```

### Validating directly (unit-style snippet)

```ts
// @ts-nocheck
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

const dto = plainToInstance(CreateExtensionCommissionDto, {
  transactionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  totalAmount: '10000', // @Type(() => Number) converts this
  participants: [
    { userId: '11111111-1111-4111-b111-111111111111', role: '<b>Agent</b>', splitPercentage: 60 },
    { userId: '22222222-2222-4222-b222-222222222222', role: 'Broker', splitPercentage: 30 },
  ],
});

const errors = await validate(dto);
// errors include the class-level `participants must total 100%` constraint;
// role is sanitized to 'Agent' by @Transform(CleanText).
```

### Validating over HTTP (E2E-style snippet)

```ts
// @ts-nocheck
await request(app.getHttpServer())
  .post('/extension-commissions')
  .send(invalidSplitPayload) // e.g. 60 + 30 = 90%
  .expect(400)
  .expect(({ body }) => {
    expect(JSON.stringify(body)).toContain('must total 100%');
  });
```

## 9. Checklist

- [ ] Every request field has a `class-validator` decorator; optional fields have `@IsOptional()`.
- [ ] Numeric/date query and body values use `@Type()`.
- [ ] Free text uses `@Transform(CleanText)` before `@IsString()`; secrets are never sanitized.
- [ ] Nested objects/arrays use both `@ValidateNested()` and `@Type(() => NestedDto)`.
- [ ] Cross-field rules use a `registerDecorator` validator, with the service check retained.
- [ ] Request and response DTOs carry `@ApiProperty` / `@ApiPropertyOptional` metadata.
- [ ] All files are under `api-extensions/`; `src/auth/sanitize.util.ts` is imported, never edited.
