# Prisma and PostgreSQL Query Optimization (`api-extensions/`)

> **Scope.** All example files below live under `api-extensions/`. The host
> files named in this guide (`src/database/n1-detector.ts`,
> `src/properties/search-where.builder.ts`, `src/database/cleanup.service.ts`)
> are read-only references; do not edit them from an extension issue. Schema
> changes belong to the core team's `prisma/` directory — extensions document
> index proposals instead of changing the schema themselves.

Most performance problems in extensions are not "Prisma is slow"; they are
over-fetching columns, looping over records with one query per record, paging
with large `skip`, or filtering on columns with no usable index. Measure first
(`EXPLAIN (ANALYZE, BUFFERS)` or the slow-query logs in `PrismaService`), then
apply the smallest fix from this guide.

## 1. Field selection: `select` vs `include`

By default `findUnique`/`findMany` return **every scalar column** of a model.
Use `select` to request exactly what the response DTO needs:

```ts
// api-extensions/services/property-listing.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../src/database/prisma.service';

export const PROPERTY_LIST_SELECT = {
  id: true,
  title: true,
  price: true,
  city: true,
  propertyType: true,
} as const;

@Injectable()
export class PropertyListingService {
  constructor(private readonly prisma: PrismaService) {}

  list(where: Record<string, unknown>) {
    return this.prisma.property.findMany({
      where,
      select: PROPERTY_LIST_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 50,
    });
  }

  async listWithAmenityCount(where: Record<string, unknown>) {
    return this.prisma.property.findMany({
      where,
      select: {
        ...PROPERTY_LIST_SELECT,
        _count: { select: { amenities: true } }, // relation count without rows
      },
      take: 50,
    });
  }
}
```

Rules:

- `select: { ... }` returns **only** those fields. Nested relations also need a
  `select` (or `include`) if you want them.
- `include: { amenities: true }` returns **all scalars plus** the relation.
  Prefer `select: { id: true, amenities: { select: { id: true, name: true } } }`
  when the client only renders a name.
- `_count` under `select` counts related rows without transferring them.
- Keep a shared, `as const` select object per DTO so "what the endpoint
  returns" is defined once; do not spread raw model objects into responses.
- Selecting fewer columns reduces both database I/O and the egress from
  Postgres to the API process — a direct cost saving on hosted databases.

## 2. Eager vs lazy loading

| Strategy | Query count | When it wins | When it hurts |
| --- | --- | --- | --- |
| Eager (`include` / nested `select`) | 1 round trip from the app (Prisma may issue several internal queries) | You always need the relation for every row | Wide relations, large text/blob columns, or relations only needed on some rows |
| Lazy (one query per row) | 1 + N | Almost never for list endpoints | Classic N+1: 100 rows → 100 extra round trips |
| Batched (one query for all parent IDs, grouped in memory) | 2 | Large lists where only a small projection of the relation is needed | Slightly more service code |

Avoid this:

```ts
// api-extensions/services/anti-pattern-lazy.service.ts — DO NOT COPY
const properties = await this.prisma.property.findMany({ take: 100 });
for (const property of properties) {
  // One extra query per property → N+1.
  property.amenities = await this.prisma.amenity.findMany({
    where: { propertyId: property.id },
  });
}
```

Prefer a nested projection when the relation is always needed:

```ts
// api-extensions/services/property-with-amenities.service.ts
return this.prisma.property.findMany({
  where: { deleted: false, status: 'ACTIVE' },
  select: {
    id: true,
    title: true,
    amenities: { select: { id: true, name: true, icon: true } },
  },
  take: 100,
});
```

Or batch and group when you need many rows and custom aggregation:

```ts
// api-extensions/services/property-amenity-batch.service.ts
const properties = await this.prisma.property.findMany({
  where: { deleted: false },
  select: { id: true, title: true },
  take: 100,
});
const ids = properties.map((property) => property.id);

const amenities = await this.prisma.propertyAmenity.findMany({
  where: { propertyId: { in: ids } }, // one query for all parents
  select: { id: true, name: true, propertyId: true },
});

const byProperty = new Map<string, { id: string; name: string }[]>();
for (const amenity of amenities) {
  const list = byProperty.get(amenity.propertyId) ?? [];
  list.push({ id: amenity.id, name: amenity.name });
  byProperty.set(amenity.propertyId, list);
}
return properties.map((property) => ({
  ...property,
  amenities: byProperty.get(property.id) ?? [],
}));
```

## 3. Cursor-based pagination

Offset pagination (`skip: page * limit`) gets slower as the offset grows because
Postgres must walk and discard earlier rows, and it duplicates or skips items
when rows are inserted between requests. Cursor pagination keys off the last
seen row instead.

```ts
// api-extensions/services/property-feed.service.ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../src/database/prisma.service';
import { PROPERTY_LIST_SELECT } from './property-listing.service';

interface Page {
  items: Array<{ id: string }>;
  nextCursor: string | null;
  hasMore: boolean;
}

@Injectable()
export class PropertyFeedService {
  constructor(private readonly prisma: PrismaService) {}

  async list(cursor: string | undefined, limit = 20): Promise<Page> {
    const take = Math.min(Math.max(limit, 1), 100);

    const rows = await this.prisma.property.findMany({
      where: { deleted: false, status: 'ACTIVE' }, // keep filters stable across pages
      select: { ...PROPERTY_LIST_SELECT, createdAt: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], // unique tiebreaker is required
      take: take + 1, // one look-ahead row tells us whether another page exists
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;
    const last = items[items.length - 1];
    return {
      items,
      hasMore,
      nextCursor: hasMore && last ? last.id : null,
    };
  }

  decodeCursor(raw: string | undefined): string | undefined {
    if (!raw) return undefined;
    const decoded = Buffer.from(raw, 'base64url').toString('utf8');
    if (!/^[\w-]{1,64}$/.test(decoded)) {
      throw new BadRequestException('Invalid cursor');
    }
    return decoded;
  }
}
```

Checklist for cursors:

- `orderBy` must be deterministic; include a unique column (`id`) as the
  tie-breaker so equal `createdAt` values do not produce duplicates.
- `skip: 1` excludes the cursor row itself; omit both `cursor` and `skip` on the
  first page.
- `take: limit + 1` is the standard look-ahead; do not return the extra row.
- Apply the same `where` on every page. Changing filters mid-scroll invalidates
  the cursor semantics.
- Add an index that matches `where` + `orderBy` (section 5), otherwise the
  database still sorts the whole result set.
- Treat cursors as opaque to clients, but validate/decode them server-side.

## 4. Batch queries and avoiding N+1

Patterns that turn many small queries into one:

- `where: { foreignKey: { in: ids } }` + group results into a `Map` (example in
  section 2).
- `groupBy({ by: ['propertyId'], _count: { _all: true } })` for per-parent
  counts.
- `createMany`, `updateMany`, `deleteMany` for bulk writes.
- `Promise.all` for independent reads (parallel, no transaction). A
  `$transaction([q1, q2])` array runs its operations **sequentially** inside one
  transaction; use it for atomicity, not for speed.
- Chunked loops for very large sets so no single statement holds a long lock.

`src/database/cleanup.service.ts` is the reference for chunked batching: it
repeatedly selects **only IDs** with `select: { id: true }, take: 500`, then
deletes by `where: { id: { in: ids } }`, looping until a batch comes back short.
Extensions doing bulk maintenance should copy that shape:

```ts
// api-extensions/services/extension-cleanup.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../src/database/prisma.service';

const BATCH_SIZE = 500;

@Injectable()
export class ExtensionCleanupService {
  private readonly logger = new Logger(ExtensionCleanupService.name);

  constructor(private readonly prisma: PrismaService) {}

  async deleteExpiredSearchHistory(cutoff: Date): Promise<number> {
    let deleted = 0;
    let batch: number;
    do {
      // Select IDs only: do not transfer whole rows just to delete them.
      const ids = await this.prisma.searchHistory.findMany({
        where: { lastSearched: { lt: cutoff } },
        select: { id: true },
        take: BATCH_SIZE,
      });
      if (ids.length === 0) break;

      const result = await this.prisma.searchHistory.deleteMany({
        where: { id: { in: ids.map((row) => row.id) } },
      });
      batch = result.count;
      deleted += batch;
    } while (batch === BATCH_SIZE);

    this.logger.log(`Removed ${deleted} expired search-history rows`);
    return deleted;
  }
}
```

## 5. Indexing best practices

Indexes are a schema concern. Extension issues should attach a **proposal**
under `api-extensions/scripts/` for the core team to apply via a migration;
never edit `prisma/schema.prisma` or `prisma/migrations/` from an extension.

```sql
-- api-extensions/scripts/index-recommendations.sql (proposal only)
-- Physical names come from prisma/schema.prisma: @@map("properties"),
-- created_at, is_deleted. The schema already has
-- @@index([status, deleted, createdAt(sort: Desc)]); this partial variant is
-- smaller for the common live-listings feed, but benchmark before adding it.
-- Supports: WHERE status = 'ACTIVE' AND is_deleted = false
--          ORDER BY created_at DESC, id DESC
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_properties_active_feed_partial
  ON "properties" ("created_at" DESC, "id" DESC)
  WHERE "status" = 'ACTIVE' AND "is_deleted" = false;

-- Equality columns first, then a range/sort column.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_properties_city_price
  ON "properties" ("city", "price");

-- Leading-wildcard ILIKE / contains() needs trigram support, not a btree index.
-- Requires the pg_trgm extension (core approval).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_properties_address_trgm
  ON "properties" USING gin ("address" gin_trgm_ops);
```

Guidelines:

- Match the index column order to the query: equality predicates first, then
  range/sort columns. A btree on `(city, price)` helps `city = ? AND price > ?`,
  not `price > ?` alone.
- To avoid an explicit `Sort` node, the index must supply the requested
  `orderBy` (with the same direction) after the filters.
- `mode: 'insensitive'` and `contains: '%term'` cannot use a plain btree index;
  use `citext` or a trigram GIN index for large text columns.
- Boolean/status columns have low selectivity alone; combine them in composite
  or partial indexes, as in the feed example.
- `OR` predicates may need an index per branch; check the plan for a
  `BitmapOr` instead of a sequential scan.
- Indexes cost write throughput and storage. Check
  `pg_stat_user_indexes` before adding another one, and remove unused indexes
  through core.
- Use `CREATE INDEX CONCURRENTLY` on live tables (outside a transaction), and
  verify with `EXPLAIN (ANALYZE, BUFFERS)` rather than guessing.

## 6. The N+1 detector utility pattern

`src/database/n1-detector.ts` contains pure, database-free helpers used by
`PrismaService` when it listens to Prisma's `query` events:

| Export | Purpose |
| --- | --- |
| `stripSqlNoise(sql)` | Removes comments, string literals, and `EXTRACT`/`SUBSTRING`-style `FROM` noise |
| `extractCteNames(sql)` / `extractTables(sql)` | Finds real table references, skipping CTE names and subquery openings |
| `extractPrimaryTable(sql)` | Picks the driving table for the warning message |
| `fingerprintQuery(sql)` | Normalises `$1`, numbers, and literals so the same shape maps to one key |
| `N1Detector` | Rolling-window counter; `record(sql, now?)` returns a detection **once** per burst when the threshold is reached |
| `isN1DetectionEnabled()` / `n1OptionsFromEnv()` | Env gating: on outside production by default, opt-in with `DB_N1_DETECTION=true`; defaults are a 100 ms window and threshold 5 |

An extension can reuse the same classification in a self-contained audit
service:

```ts
// api-extensions/services/extension-query-audit.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  isN1DetectionEnabled,
  n1OptionsFromEnv,
  N1Detection,
  N1Detector,
} from '../../src/database/n1-detector';
import { PrismaService } from '../../src/database/prisma.service';

interface QueryEvent {
  query: string;
  params: string;
  duration: number;
}

type QueryEventSource = { $on(event: 'query', callback: (event: QueryEvent) => void): void };

@Injectable()
export class ExtensionQueryAuditService implements OnModuleInit {
  private readonly logger = new Logger(ExtensionQueryAuditService.name);
  private readonly detector: N1Detector | null = isN1DetectionEnabled()
    ? new N1Detector(n1OptionsFromEnv())
    : null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    if (!this.detector) return;
    // Opt-in diagnostic hook. PrismaService already installs its own detector,
    // so enable this only locally and never alongside the global one long-term.
    (this.prisma as unknown as QueryEventSource).$on('query', (event) => {
      this.inspect(event);
    });
  }

  inspect(event: QueryEvent): void {
    if (!this.detector) return;
    const detection: N1Detection | null = this.detector.record(event.query);
    if (detection) {
      this.logger.warn(
        `[Extension N+1] ${detection.table} hit ${detection.count}x ` +
          `in ${detection.windowMs}ms (shape: ${detection.fingerprint.slice(0, 200)})`,
      );
    }
  }
}
```

Interpretation notes:

- A detection is a **hint**, not proof. Batching legitimately fires similar
  statements; compare the fingerprint and check the call site.
- `record()` returns once when the count *equals* the threshold in the window —
  not on every subsequent query — which prevents log floods.
- `fingerprintQuery` deliberately maps different parameter values to the same
  shape, so a burst from a loop is visible even though the SQL text differs.
- Never log `event.params`: they can contain PII. The detector only classifies
  the SQL string.
- For unit tests of the detector itself, call `record()` with an explicit
  `now` timestamp; no database is needed.

## 7. Building efficient `where` clauses

`src/properties/search-where.builder.ts` shows the maintainable approach: a
**pure function** that translates a DTO into a Prisma `where` object, with
validation and no database access. Extensions should follow it instead of
building filters inline in services:

```ts
// api-extensions/services/extension-search-where.builder.ts
import { BadRequestException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PropertyStatus } from '../../src/types/prisma.types';

export interface ExtensionSearchInput {
  city?: string;
  minPrice?: number;
  maxPrice?: number;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  tag?: string;
  status?: PropertyStatus;
}

export function buildExtensionSearchWhere(input: ExtensionSearchInput): Record<string, unknown> {
  const where: Record<string, unknown> = {
    deleted: false,
    status: input.status ?? PropertyStatus.ACTIVE,
  };

  if (input.city) where.city = { equals: input.city, mode: 'insensitive' };

  if (input.minPrice !== undefined || input.maxPrice !== undefined) {
    const price: Record<string, Decimal> = {};
    if (input.minPrice !== undefined) price.gte = new Decimal(input.minPrice.toString());
    if (input.maxPrice !== undefined) price.lte = new Decimal(input.maxPrice.toString());
    where.price = price; // Decimal columns must not be compared with JS floats
  }

  if (input.tag) where.tags = { has: input.tag };

  const hasLat = input.lat !== undefined;
  const hasLng = input.lng !== undefined;
  if (hasLat !== hasLng) {
    throw new BadRequestException('Both lat and lng must be provided together');
  }
  if (hasLat && hasLng) {
    const radius = input.radiusKm ?? 0;
    const latDelta = radius / 111; // 1° latitude ≈ 111 km
    const lngDelta = radius / (111 * Math.cos((input.lat! * Math.PI) / 180));
    where.latitude = { gte: input.lat! - latDelta, lte: input.lat! + latDelta };
    where.longitude = { gte: input.lng! - lngDelta, lte: input.lng! + lngDelta };
  }

  return where;
}
```

Why this helps performance:

- One place to enforce `deleted: false` and a default status, so no endpoint
  accidentally scans soft-deleted rows.
- Range columns (`price`, `latitude`, `longitude`) are pushed into SQL instead
  of filtering in JavaScript after over-fetching.
- Pure function → cheap unit tests, and the same `where` can be reused by
  `findMany`, `count`, and cursor pagination so page counts agree.
- Keep `OR` branches few and indexed; broad `contains` across many columns is
  the most common cause of sequential scans in property search.

## 8. Before/after checklist

| Smell | Fix |
| --- | --- |
| `findMany()` with no `select` | Project only DTO fields with `select` |
| `include: { relation: true }` everywhere | Nested `select` of needed columns, or `_count` |
| Loop with one query per row | `where: { id: { in: ids } }` + `Map`, or nested eager load |
| `skip: 5000` for deep pages | Cursor pagination with stable `orderBy` + look-ahead row |
| `findMany()` returning full rows just to delete them | `select: { id: true }, take: 500` + `deleteMany({ id: { in: ids } })` |
| `ILIKE '%term%'` / `contains` on a large table | Trigram GIN index or citext; avoid leading wildcard where possible |
| Slow list endpoint with correct query shape | Composite/partial index matching `where` + `orderBy`; verify with `EXPLAIN` |
| Repeated similar SQL in logs | N+1 detector fingerprint, then batch the call site |
| Several independent reads awaited one by one | `Promise.all` (or `$transaction([...])` only when atomicity is needed) |

## References in the host codebase (read-only)

- `src/database/n1-detector.ts` — SQL classification, rolling-window detector, and env gating.
- `src/database/prisma.service.ts` — query event hook that feeds the detector and logs slow queries (with PII scrubbing).
- `src/properties/search-where.builder.ts` — pure DTO-to-`where` translation with Decimal and geo handling.
- `src/database/cleanup.service.ts` — chunked `select: { id: true }` + `deleteMany` batching at `BATCH_SIZE = 500`.
- `api-extensions/docs/testing-strategies.md` — mock Prisma in tests instead of opening a connection while profiling queries.
