# API Extension Scripts

Standalone TypeScript utilities for API extensions. Every script runs with `ts-node` from the repository root and writes its reports to `api-extensions/reports/`.

## Bulk property import

```bash
npx ts-node api-extensions/scripts/bulk-property-import.ts \
  --input properties.csv --dry-run --batch-size 100
```

CSV columns and JSON keys use Prisma field names (`zipCode`/`zip_code`, `propertyType`/`property_type`, `ownerId`/`owner_id` are accepted). Required fields are `title`, `address`, `city`, `state`, `zipCode`, `price`, `propertyType` and `ownerId`.

The script validates rows, deduplicates first within the input file and then against existing properties (normalized address similarity or coordinates within 50 metres), and inserts accepted records with `prisma.property.createMany` in configurable batches. `--dry-run` skips all database access. The JSON summary reports scanned rows, imported records, skipped duplicates, validation errors, batch count and elapsed time. The process exits with status 1 if any row failed validation.

## Prisma schema diff reporter

```bash
npx ts-node api-extensions/scripts/prisma-schema-diff.ts --from HEAD --to prisma/schema.prisma
```

Parses both schemas and reports added, removed and modified models, fields, enums, enum values, relations and indexes. `HEAD` reads `prisma/schema.prisma` from the current commit via `git show`, which makes it suitable for migration planning in CI. Outputs `schema-diff.json` and `schema-diff.md`; add `--fail-on-change` to exit with status 1 when differences exist.

Interpretation: `removed` model/field/index entries require a reviewed migration before deployment; `modified` field entries flag type, nullability, default, map or relation drift; `added` enum values are usually backward compatible while removed values may break existing clients.

## API endpoint inventory generator

```bash
npx ts-node api-extensions/scripts/api-endpoint-inventory.ts --module amenity-management --method GET
```

Scans every `*.controller.ts` below `api-extensions/` with the TypeScript AST, extracting controller and route paths, HTTP methods, body/query/param DTOs, guard decorators and authentication requirements. Use `--module` and `--method` to filter. Outputs `api-inventory.json` (raw records), `api-inventory.md` (table) and `api-inventory.openapi.json` (OpenAPI 3.0 document with bearer security schemes).

Interpretation: an endpoint with `authRequired: false` is a public surface and should be reviewed against the API security policy. Missing DTOs on mutation endpoints indicate unvalidated request bodies. The OpenAPI document can be imported into API tooling to compare documented versus implemented routes.

## Database index audit script

```bash
npx ts-node api-extensions/scripts/database-index-audit.ts --model Property
npx ts-node api-extensions/scripts/database-index-audit.ts --db-stats
```

Combines static analysis of the Prisma schema with a scan of Prisma client calls under `src/` and `api-extensions/`. It reports fields used in `where` clauses that are not covered by a leading index, relations included inside loops that may cause N+1 queries, and (with `--db-stats`) indexes with zero scans from `pg_stat_user_indexes`. Outputs `database-index-audit.json` and `database-index-audit.md`.

Interpretation: `high` severity missing indexes correspond to frequently filtered fields and are the best candidates for a new composite index; verify selectivity and write patterns before adding one. `n-plus-one` findings should be resolved with `include`, dataloading or explicit joins. `unused-index` findings are candidates for removal only after observing a full business cycle, because PostgreSQL statistics reset on server restart and rarely used indexes may still protect reporting queries.
