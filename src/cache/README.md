# Cache Module

Global Redis-backed cache (`@nestjs/cache-manager` v3 / Keyv), with key conventions, TTL presets, tag-based invalidation, cache warming, hit/miss metrics and HTTP cache headers.

`CacheModuleConfig` is `@Global()`, so inject `CacheService` anywhere without importing the module.

## Files

| File                           | Purpose                                                           |
| ------------------------------ | ----------------------------------------------------------------- |
| `cache.config.ts`              | Redis store, `CACHE_KEYS`, `CACHE_TTL`, tags                      |
| `cache.service.ts`             | `get/set/del/getOrSet`, tag and entity invalidation, `setNx` lock |
| `cache-warming.service.ts`     | Startup and periodic warming                                      |
| `cache-monitoring.service.ts`  | Hit/miss stats and health                                         |
| `cache-metrics.interceptor.ts` | Records hit/miss per request                                      |
| `cache-headers.interceptor.ts` | Sets HTTP `Cache-Control` headers                                 |
| `cache.decorator.ts`           | Method-level caching decorators                                   |
| `cache-stats.controller.ts`    | Admin endpoints                                                   |

## Endpoints (admin only)

`JwtAuthGuard` + `RolesGuard`, `@Roles(ADMIN)`:

| Method   | Path            | Description                |
| -------- | --------------- | -------------------------- |
| `GET`    | `/cache/stats`  | Hit/miss statistics        |
| `GET`    | `/cache/health` | Redis connectivity         |
| `DELETE` | `/cache/clear`  | **Flush the entire cache** |

## TTLs

`CacheService.set(key, value, ttl)` takes **seconds** and converts to ms for Keyv. The module-level default (when calling the cache manager directly) is 10 minutes.

| Preset               | Seconds | Preset                | Seconds |
| -------------------- | ------- | --------------------- | ------- |
| `SHORT`              | 300     | `SEARCH_RESULTS`      | 300     |
| `MEDIUM` (default)   | 900     | `USER_PROFILE`        | 1800    |
| `LONG`               | 3600    | `SESSION`             | 7200    |
| `VERY_LONG`          | 86400   | `TRUST_SCORE`         | 3600    |
| `LEADERBOARD`        | 1800    | `FEATURED_PROPERTIES` | 3600    |
| `DASHBOARD_STATS`    | 600     | `DASHBOARD_ANALYTICS` | 1800    |
| `EMAIL_VERIFICATION` | 600     | `RATE_LIMIT`          | 900     |

Always build keys with `CACHE_KEYS.*` (e.g. `CACHE_KEYS.PROPERTY_BY_ID(id)` → `property:<id>`) so invalidation helpers find them.

## Cache warming

| When                      | What                                                        |
| ------------------------- | ----------------------------------------------------------- |
| `onModuleInit` (startup)  | Full `warmCache()`, **awaited**, so it delays app bootstrap |
| `@Cron(EVERY_30_MINUTES)` | Full `warmCache()`                                          |

`warmCache()` runs these in parallel with `Promise.allSettled`, so one failure doesn't stop the others:

- **Featured properties**: `properties:featured`, TTL `FEATURED_PROPERTIES`
- **Popular properties**: `properties:popular`, TTL `MEDIUM`
- **Trust-score leaderboard**: TTL `LEADERBOARD`
- **Popular search terms**: `search:popular`, TTL `MEDIUM`
- **Predictive keys**: refreshes the TTL of hot keys **only if they are already cached** (never populates cold keys)

Set `CACHE_WARMING_ENABLED=false` to disable both startup and periodic warming (useful in tests and CLI scripts).

## Invalidation

- `invalidateUserCache(userId)` and `invalidatePropertyCache(propertyId?)` delete the known keys for that entity plus the list and featured keys.
- `invalidateByTag(tag)` deletes all keys registered with that tag via `set(key, value, ttl, tag)`.
- Call invalidation **after** the DB write commits, in the service that performs the write.

## Configuration

| Variable                | Default     |
| ----------------------- | ----------- |
| `REDIS_HOST`            | `localhost` |
| `REDIS_PORT`            | `6379`      |
| `REDIS_PASSWORD`        | (none)      |
| `REDIS_DB`              | `0`         |
| `CACHE_WARMING_ENABLED` | `true`      |

## Gotchas

- **Tag map is in-memory per process.** `invalidateByTag` only deletes keys tagged by _this_ replica since it started. Other replicas' tagged keys survive until TTL. Prefer explicit key invalidation for correctness-critical data.
- **Password URL format:** `getRedisConnectionString()` builds `redis://<password>@host`. Redis URLs expect `redis://:<password>@host` (or `user:password`), so the password may be parsed as a username. Check auth if Redis requires a password.
- Startup warming is awaited in `onModuleInit`. A slow DB or Redis delays readiness (`/readyz`), so tune probe timeouts or set `CACHE_WARMING_ENABLED=false`.
- Warming runs on **every replica** at startup and every 30 minutes, so N replicas issue N× the warming queries.
- `DELETE /cache/clear` also wipes rate-limit counters, email-verification codes and sessions stored in the same Redis DB.
- `set` failures are logged and swallowed. A Redis outage degrades to cache misses instead of request errors.

Related: [docs/Optimize_Queries.md](../../docs/Optimize_Queries.md), [docs/Monitor_Performance.md](../../docs/Monitor_Performance.md).
