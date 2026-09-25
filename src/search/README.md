# Search Module

Property search with filters, facets, cursor pagination, autocomplete, fuzzy matching, saved filters, and privacy-aware search analytics.

## Files

| File                                                 | Purpose                                                       |
| ---------------------------------------------------- | ------------------------------------------------------------- |
| `search.controller.ts`                               | `/search/*` routes                                            |
| `search.service.ts`                                  | Orchestrates filters → query → facets → suggestions → history |
| `search-filters.service.ts`                          | Builds Prisma `where` clauses from `SearchQuery`              |
| `search-facets.service.ts`                           | In-memory facet counts and facet filtering                    |
| `search-geographic.service.ts`                       | Radius / bounding-box filtering                               |
| `search-autocomplete.service.ts`                     | Mixed-source live suggestions                                 |
| `fuzzy-search.service.ts`                            | Typo-tolerant matching (Damerau-Levenshtein)                  |
| `search-history.service.ts`                          | Per-user search history                                       |
| `search-analytics.service.ts`                        | Aggregate analytics, trends, opt-out handling                 |
| `search-export.service.ts`                           | Export result sets                                            |
| `image-search.service.ts`, `voice-search.service.ts` | Experimental input modes (not exposed by the controller)      |

## Endpoints

All routes require `JwtAuthGuard`.

| Method | Path                             | Description                                                                 |
| ------ | -------------------------------- | --------------------------------------------------------------------------- |
| `POST` | `/search/properties`             | Search with filters; returns `items`, `facets`, `suggestions`, `nextCursor` |
| `GET`  | `/search/suggestions?q=`         | Basic suggestions                                                           |
| `GET`  | `/search/autocomplete?q=&limit=` | Live autocomplete; `limit` clamped to **1–20**, default 10                  |
| `GET`  | `/search/filters/saved`          | Caller's saved filters                                                      |
| `POST` | `/search/filters/save`           | Save a filter                                                               |
| `GET`  | `/search/analytics`              | Caller's search analytics                                                   |
| `GET`  | `/search/analytics/popular`      | Global popular searches                                                     |

## Facet semantics

Facets are computed by `SearchFacetsService.buildFacets(items, fields)` over the result items **of the current page**:

- Fields: `propertyType`, `status`, `city`, `state`, `bedrooms`, `bathrooms`.
- Each value is stringified (`3` and `"3"` are the same bucket); `null`/`undefined` are **skipped** (no "unknown" bucket).
- Buckets are sorted by count, descending. There is no top-N cap.
- `applyFacetFilter(items, filters)` is an **exact, case-sensitive string match** combined with **AND** across fields. Multi-select within one field (OR) is not supported.

Because facets are counted over the returned page and not the whole matching set, counts change as you paginate. If you need global counts, use a Prisma `groupBy` on the same `where` clause.

## Pagination

Cursor-based: `nextCursor` is the base64-encoded `createdAt` ISO timestamp of the last item. It is `null` when the page is shorter than `limit`. Items that share the same `createdAt` can be skipped at page boundaries.

## Autocomplete

`getSuggestions(query, limit, userId)` blends sources with a fixed budget: property titles (~25%), locations (~25%), features (~15%), and the rest from popular and personal history.

## Fuzzy search

`FuzzySearchService.search(query, items, { threshold })` scores by normalised optimal-string-alignment distance. Default `threshold` is **0.4** (min similarity). Candidates whose distance exceeds **60%** of the longer string's length are rejected outright.

## Privacy

Users who set `searchAnalyticsOptOut` in their preferences get **no** PII-bearing `SearchAnalytics`/`SearchHistory` rows. Only anonymous aggregate counters are recorded. See [docs/Search_Analytics_Privacy.md](../../docs/Search_Analytics_Privacy.md).

## Gotchas

- ⚠️ **`searchProperties()` currently returns mock data.** The filter `where` clause is built, but `items` is hard-coded to `[]` and `total` to `0` pending the Prisma query. Facets are therefore always empty. Wire the real `prisma.property.findMany({ where, take: limit })` before relying on this endpoint.
- [Cache warming](../cache/README.md) writes popular terms to `search:popular` every 30 min, but autocomplete currently queries its sources directly and doesn't read that key.
- `image-search` and `voice-search` are providers only; no route calls them yet.

## Tests

`search.service.spec.ts`, `fuzzy-search.service.spec.ts`, `search-analytics.service.spec.ts`. Run with `npx jest src/search`.
