# Webhooks Module

Lets users register HTTPS endpoints that receive signed event payloads (e.g. `property.created`, `transaction.updated`). Delivery is asynchronous with retries and exponential backoff.

> ⚠️ **Not currently mounted.** `WebhooksModule` is not imported by `AppModule` (or any other module), so the `/webhooks` routes and the retry cron are **not active** at runtime. Import it in `src/app.module.ts` to enable it; that also requires a BullMQ Redis connection (`BullModule.forRoot`).

## Files

| File                            | Purpose                                                     |
| ------------------------------- | ----------------------------------------------------------- |
| `webhooks.controller.ts`        | CRUD, delivery history, verification challenge              |
| `webhooks.service.ts`           | Event fan-out, delivery, signing, retry cron, rate limiting |
| `webhook-delivery.processor.ts` | BullMQ worker for the `webhook-delivery` queue              |
| `url-validator.util.ts`         | SSRF protection for target URLs                             |
| `webhook.dto.ts`                | Create / update DTOs                                        |

## Endpoints

All routes require `JwtAuthGuard`; a user can only see and modify **their own** webhooks.

| Method   | Path                       | Description                                    |
| -------- | -------------------------- | ---------------------------------------------- |
| `POST`   | `/webhooks`                | Register a webhook (URL is SSRF-validated)     |
| `GET`    | `/webhooks`                | List the caller's webhooks                     |
| `GET`    | `/webhooks/:id`            | Get one webhook                                |
| `PATCH`  | `/webhooks/:id`            | Update URL, events or status                   |
| `DELETE` | `/webhooks/:id`            | Delete                                         |
| `GET`    | `/webhooks/:id/deliveries` | Delivery log (`WebhookDeliveryLog`)            |
| `POST`   | `/webhooks/:id/verify`     | Send a challenge to confirm endpoint ownership |

## Delivery pipeline

```
WebhooksService.trigger(eventType, payload)
  └─ for each ACTIVE webhook subscribed to eventType
       ├─ per-webhook rate limit check (drop + warn if exceeded)
       ├─ create WebhookDeliveryLog (status PENDING)
       └─ enqueue 'deliver-webhook' on BullMQ queue 'webhook-delivery'
              └─ WebhookDeliveryProcessor → deliverWebhook()
```

If the queue is not available (`@Optional()` injection), delivery falls back to `setImmediate()` so the caller still returns immediately, but **without BullMQ retries**.

### Request format

- `POST` to the webhook URL with a JSON body.
- `X-Webhook-Signature`: hex **HMAC-SHA256** of the raw body using the webhook's `secret`. Receivers must verify this with a constant-time comparison.
- Timeout: **30 s** per delivery (10 s for the verification challenge).
- Any non-2xx response or network error counts as a failure.

### Retry and backoff

There are two retry mechanisms layered on top of each other:

| Layer         | Policy                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------- |
| BullMQ job    | `attempts: 5`, exponential backoff starting at **1 s** (1, 2, 4, 8 s…)                   |
| DB retry cron | `@Cron(EVERY_MINUTE)` re-enqueues rows with `status = RETRYING` and `nextRetryAt <= now` |

After each failed attempt the delivery log is updated: `attempts++`, `error`, `responseBody` (truncated to 2,000 chars), and `nextRetryAt` from the schedule `[1s, 5s, 15s, 60s, 300s]` indexed by attempt number. After **5** attempts the status becomes `FAILED` and no further retries happen. Failed jobs are kept in Redis (`removeOnFail: false`) and can be retried from `/admin/queues/webhook-delivery/...` once that queue is registered with the admin queue monitor.

## Configuration

| Variable                     | Default | Purpose                                                       |
| ---------------------------- | ------- | ------------------------------------------------------------- |
| `WEBHOOK_TRIGGER_RATE_LIMIT` | `60`    | Max triggers per webhook per rolling 60 s window              |
| `WEBHOOK_DEV_ALLOWLIST`      | (empty) | Comma-separated hosts/IPs exempt from SSRF checks in dev/test |
| `WEBHOOK_ALLOWLIST`          | (empty) | Fallback name for the above                                   |
| `NODE_ENV`                   | —       | Anything other than `development`/`test`/unset enforces HTTPS |

## Security model

- **SSRF protection** (`validateWebhookUrl`): only `http:`/`https:`, HTTPS required outside dev/test, rejects `localhost`, `*.local`, `*.internal`, cloud-metadata hostnames, and any hostname that **resolves** to private, loopback, link-local, CGNAT, multicast, documentation or IPv4-mapped-private addresses (IPv4 and IPv6).
- The allowlist only applies when `NODE_ENV` is `development`, `test` or unset. It is ignored in production.
- Ownership is enforced by filtering every query on `userId`.

## Gotchas

- **DNS rebinding:** the URL is validated at registration/update time, not at delivery time. A hostname that later resolves to a private IP would still be called. Re-validate in `deliverWebhook()` if this matters for your deployment.
- The rate limiter is **in-memory per process**; with N replicas the effective limit is N × `WEBHOOK_TRIGGER_RATE_LIMIT`. Rate-limited triggers are dropped, not queued.
- Retries can come from both BullMQ and the cron, so receivers must be **idempotent** (dedupe on the delivery ID).
- `ScheduleModule.forRoot()` is imported here as well as in `AppModule`; harmless, but don't add a third.

## Tests

`webhooks.service.spec.ts`. Run with `npx jest src/webhooks`.
