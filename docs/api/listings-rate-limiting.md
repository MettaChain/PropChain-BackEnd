# Listing API rate limiting

The public listing routes are protected by the platform's existing global
`RateLimitGuard` plus the per-endpoint table in
`src/auth/rate-limit.config.ts`. No new guard was added — the mechanism was
already there.

| Route | Limit | Notes |
| --- | --- | --- |
| `GET /properties` | 100 per minute | pre-existing |
| `GET /properties/search` | 60 per minute | **added by this change** |
| `POST /properties` | 20 per hour | pre-existing |

Over the limit the response is `429` with the usual `X-RateLimit-*` headers and
`Retry-After`.

## What was actually missing

`GET /properties/search` had **no entry in the endpoint table at all**. Both
listing routes are unauthenticated, so a request to them was bounded only by the
global per-IP bucket — which is shared with every other endpoint on the API. A
single client could spend that entire budget on search alone, and search is by
far the most expensive read in the module: up to 25 filters, an optional
in-memory trust-score pass, and a `COUNT` issued alongside every page.

Sixty searches per minute is above what a person paging through filters needs,
while cutting the worst case by roughly 40%.

## Caller identity

Unauthenticated requests are keyed by client IP. The guard hashes it and only
consults `x-forwarded-for` when `TRUST_PROXY` is set, so header spoofing cannot
rotate buckets (`#1195`). Authenticated callers are additionally bounded by their
own user-tier bucket, so one noisy account cannot exhaust a shared IP's allowance.

`checkScopedRateLimit` per-route counters were considered and rejected: they
would have needed a new guard class wired into `PropertiesController`, which adds
DI surface for behaviour the existing global guard already provides.
