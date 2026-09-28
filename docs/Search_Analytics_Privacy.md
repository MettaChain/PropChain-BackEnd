# Search Analytics & Privacy

## Overview

Search activity is recorded per user for product analytics. Because these rows
contain personal data (`SearchAnalytics` stores `userId`, query, filters, and
`SearchHistory` stores `userId` + query), they are subject to retention pruning
and per-user opt-out.

## Opt-out (#1184)

Users control tracking via the `searchAnalyticsOptOut` user preference
(`UserPreferences` model, exposed through the user-preferences API).

- **Opted out**: no `SearchAnalytics` or `SearchHistory` row is written for that
  user's searches. The aggregated `PopularSearch` counter still updates so
  product quality signals are preserved without per-user tracking.
- **Default**: `false` (analytics recorded).

## Retention (#1182)

Per-search and per-user search rows are purged by the daily cleanup job
(`CleanupService`, runs at 02:00 UTC) after a configurable retention window:

| Entity               | Env var                         | Default |
| -------------------- | ------------------------------- | ------- |
| `SearchAnalytics`    | `CLEANUP_SEARCH_RETENTION_DAYS` | 30      |
| `SearchHistory`      | `CLEANUP_SEARCH_RETENTION_DAYS` | 30      |
| `RequestLog`         | `CLEANUP_REQUESTLOG_DAYS`       | 7       |
| `WebhookDeliveryLog` | `CLEANUP_WEBHOOK_LOG_DAYS`      | 30      |

Aggregated `PopularSearch` rows are intentionally retained (they contain no
personal identifiers) and power the "popular searches" product surface.

## Analytics write coalescing (#1296)

`RequestLog` is written by the analytics interceptor on every HTTP request, so
writes are coalesced rather than issued per request:

- The in-process buffer flushes every 5 s or once it reaches 500 records.
- When `ANALYTICS_USE_REDIS_BUFFER=true` (default in production), records are
  appended to a Redis list (`analytics:requestlogs:buffer`) and drained to the
  database by a 10 s cron, so buffered writes survive restarts and are shared
  across replicas.
- `analytics_request_logs_written_total` and
  `analytics_request_log_write_failures_total` (labelled by `stage`) expose
  write throughput and failure rates on `/metrics`.

## GDPR / Data Subject Rights

- **Export**: `data-export.service.ts` already includes `searchHistory` and
  `searchAnalytics` rows in the per-user export.
- **Deletion**: deleting a user cascades to `SearchHistory` (relation `User`,
  `onDelete: Cascade`) and nulls the owning user on `SearchAnalytics`
  (`onDelete: SetNull`); opted-out users generate no rows in the first place.
