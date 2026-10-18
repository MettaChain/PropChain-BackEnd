# Listing API input sanitization

Search and bulk-filter values are attacker-influenced and are used three times
over: they become Prisma `equals` / `contains` / `has` predicates, they are
hashed into cache keys, and they are written to the search log line. All three
want the same thing — a value with no control characters and no stray
whitespace.

`sanitize-listing-query.util.ts` provides `TrimListingQuery`, wired in as
`class-transformer` `@Transform` callbacks. The global `ValidationPipe` already
runs with `transform: true`, so no pipe configuration changed.

| Applied to | Fields |
| --- | --- |
| `SearchPropertiesDto` | `city`, `state`, `zipCode`, `country`, `location`, `propertyType`, `sortBy`, `category`, `tag`, `amenityType` |
| `BulkPropertyExportDto` | `filter` |

Effect: NFKC normalisation, C0/C1 control characters (including NUL) stripped,
then trimmed.

## Why this is deliberately weaker than the write path

The property write DTOs (`properties-input-sanitization.md`) additionally strip
HTML tags. Listing queries deliberately do **not**, because a query is a *filter*,
not content:

- a search for `a < b` or `2 < 3` must not silently change meaning,
- `contains` and `equals` are already bound as parameters by Prisma, so a tag in
  a filter has nothing to execute against,
- stripping markup from a filter only makes the result set *less* predictable.

Tag stripping belongs where a value is stored and rendered, not where it selects
rows.

## `sortBy` is now constrained to the declared allow-list

`SearchPropertiesDto` has always declared `PROPERTY_SORT_FIELDS`, but `sortBy`
was validated with `@IsString()` alone and then interpolated straight into
`orderBy: { [sortBy]: sortOrder }`. A request for `?sortBy=nonexistent` therefore
reached Prisma with a column that does not exist and came back as a `500`,
rather than as the `400` a caller could act on.

`sortBy` is now `@IsIn(PROPERTY_SORT_FIELDS)`, which is what the constant was
there for. Besides producing the right status code, it stops an arbitrary column
from being used as a sort key.

## Cache-key interaction

Normalising before the value reaches `listingSearchCacheKey` means `?city= Austin`
and `?city=Austin` produce the same key. Without this, the two spellings would
occupy separate cache entries and each would pay a full database round trip.
