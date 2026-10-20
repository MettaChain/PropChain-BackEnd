# Listing API Prometheus metrics

Exposed on the existing `/metrics` endpoint. These sit alongside, not instead of, the per-handler metrics in `properties-metrics.md`: a listing feed needs to answer "how much are we serving, how fast, and how much of it came from cache", which is a different question from "which handler is slow".

| Metric | Type | Labels |
| --- | --- | --- |
| `properties_listings_served_total` | counter | `surface` (`list`, `search`), `outcome` (`success`, `client_error`, `server_error`) |
| `properties_listing_response_seconds` | histogram | `surface` |
| `properties_listing_results_returned` | histogram | `surface` |
| `properties_listing_cache_lookups_total` | counter | `outcome` (`hit`, `miss`, `bypass`) |

`ListingsMetricsInterceptor` records the first three for `GET /properties` and `GET /properties/search`; `PropertiesListingsCacheService` records the fourth.

## Cardinality

Every label set is fixed: `surface` has two values, `outcome` three, and the cache `outcome` three. None of them can grow with request input, which is what makes these safe to keep at 1% scrape resolution. The interceptor derives `surface` from the request path rather than the handler name so adding a handler does not silently widen the label space.

`properties_listing_results_returned` is the one worth alerting on: a histogram of how many listings each response carried. A drop toward zero while request volume is flat means the index or filters are wrong, and it is visible long before anyone reports that "search is broken".

`properties_listing_cache_lookups_total` separates `hit` from `miss` from `bypass`. `bypass` is the interesting one: it counts a query that was never cacheable (empty filter set, oversized key, no cache configured) or that fell back to the database because the cache errored. A rising `bypass` share usually means Redis is unhealthy, which the counter makes visible before latency degrades.
