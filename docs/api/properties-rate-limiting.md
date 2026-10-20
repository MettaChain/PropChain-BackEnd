# Property API rate limiting

`PropertiesRouteRateLimitGuard` + `@PropertiesRouteLimit({ max, windowMs })` limit
costly or abusable routes per caller (the authenticated user id, falling back to
the client address). Each route has its own counter.

| Route | Limit |
| --- | --- |
| `POST /properties` | 30 per hour |
| `POST /properties/bulk/status` | 20 per hour |
| `POST /properties/bulk/delete` | 20 per hour |
| `POST /properties/bulk/export` | 10 per hour |
| `GET /properties/:id/report` | 15 per hour |

Over the limit the response is `429` with a `Retry-After` header. The guard is
registered after the JWT guard on authenticated routes so the caller is known.

Counters are namespaced `properties-route:<METHOD> <path>` in the shared
`RateLimitService`, so they are independent from the users route limits and from
the existing in-service geocoding throttle.

The public read routes (`GET /properties`, `GET /properties/search`) are not
limited here; they are unauthenticated and are covered separately.
