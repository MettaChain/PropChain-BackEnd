# Listing API Redis caching

`GET /properties/search` is read through `PropertiesListingsCacheService` on the shared `CacheService` (Redis when configured).

- Key: `properties:search:<sha1 of the normalised filter set>`, TTL **30 seconds**.
- Entries are also registered under `CACHE_TAGS.PROPERTIES`, so a property write invalidates them alongside the rest of the property cache.
- Read-through only: a cache error, or no cache being available, falls through to the database, so caching can never fail a request.

## Why 30 seconds and why search only

The TTL is deliberately short. A listing can be published, repriced or taken down
at any moment, and the public feed is the one surface where serving a stale
listing is immediately visible to a buyer. Thirty seconds bounds the damage while
still absorbing the repeated identical queries a listing page produces while a
user pages through filters.

`GET /properties` (the unpaged feed) is **not** cached. Its result set changes on
almost every write and it is the cheaper of the two queries, so caching it mostly
buys invalidation risk for little gain.

## Cache key normalisation

`listingSearchCacheKey` sorts the filter entries by name and drops absent values
before hashing, so key order in the query string and omitted-vs-`undefined` cannot
produce two keys for the same filter set. An empty filter set is **not** cached:
it is the full listing feed, which changes constantly and is the case where a
stale answer would be most damaging.

Keys longer than 2 KB of serialised filters are also not cached, which keeps a
pathological query from producing an unbounded Redis key.

## Observability

Every lookup records `properties_listing_cache_lookups_total{outcome}` where
outcome is `hit`, `miss` or `bypass`. `bypass` covers a query that was never
cacheable and a cache that errored — see `listings-metrics.md`.

`PropertiesListingsCacheService` is injected into `PropertiesService` with
`@Optional()`, so the service still constructs without it and the existing unit
test module is unaffected.
