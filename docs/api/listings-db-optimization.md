# Listing API database query optimisation

## The case-insensitive filters could never use an index

This is the significant one. `GET /properties/search` filters with Prisma's
`mode: 'insensitive'`, which compiles to:

```sql
LOWER("city") = LOWER($1)
```

A plain btree index on the raw column is **unusable** for that expression, because
the indexed values are `Austin` while the lookup key is `LOWER("city")`. So
`@@index([city, state])` and `@@index([propertyType])` were never chosen by the
planner for the filters they were added for — the most common filters in the
product. The same applies to `country`, `category` and the amenity join.

`prisma/migrations/20261001000001_add_listing_search_functional_indexes` indexes
the *expression* instead, leading with the listing predicate so a filtered search
is a single index seek:

| Index | Serves |
| --- | --- |
| `(status, is_deleted, LOWER(city))` | `?city=` |
| `(status, is_deleted, LOWER(state))` | `?state=` |
| `(status, is_deleted, LOWER(property_type))` | `?propertyType=` |
| `(status, is_deleted, LOWER(category)) WHERE category IS NOT NULL` | `?category=` |
| `GIN (tags)` | `where: { tags: { has: tag } }` |
| `LOWER(amenity_type)` on `property_amenities` | `?amenityType=` |

`?tags=` was array containment (`{ has: tag }`), which needs GIN — a btree index
cannot answer it. `?category=` is partial because the column is optional, so
indexing the empty majority would waste space and scan time for nothing.

### A caveat for maintainers

Prisma cannot express functional or partial indexes in `schema.prisma`, so these
six are **intentionally not declared in the schema**. That means a future
`prisma migrate dev` may propose dropping them as unmanaged drift. If it does,
do not accept the drop — re-create them. Keeping them in sync by hand is the only
option until the schema format can express them.

### Not done here

The free-text `?location=` filter does `contains` across address, city, state and
zipCode, which really wants a `pg_trgm` GIN index or Postgres full-text search.
That needs the extension enabled on the database, which is a platform decision
rather than a migration this PR should make unilaterally — flagged for follow-up.

## Cached searches avoid the query entirely

`GET /properties/search` is read through a short-lived cache
(`docs/api/listings-caching.md`), so a repeated query does not reach Postgres at
all.
