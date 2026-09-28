# Webhook System Documentation

## Overview

PropChain supports transactional and event-driven webhooks for asynchronous notifications. Webhooks are delivered via HTTP POST requests with cryptographically verified payloads.

## Delivery & Retry Semantics (#1256)

### Retry Backoff Schedule

When an endpoint responds with a non-2xx status or a network timeout/error occurs, the webhook delivery is automatically scheduled for retry using a deterministic backoff schedule:

| Attempt | Failure Sequence | Backoff Delay | Next Retry Timestamp |
| ------- | ---------------- | ------------- | -------------------- |
| 1       | Initial failure  | 1 second      | `now + 1,000ms`      |
| 2       | 1st retry fails  | 5 seconds     | `now + 5,000ms`      |
| 3       | 2nd retry fails  | 15 seconds    | `now + 15,000ms`     |
| 4       | 3rd retry fails  | 60 seconds    | `now + 60,000ms`     |
| 5       | 4th retry fails  | 300 seconds   | `now + 300,000ms`    |

After 5 failed attempts (`MAX_ATTEMPTS = 5`), the delivery log is marked as `FAILED` and no further retries will be attempted.

### Idempotency & Deduplication

To protect receivers against duplicate side-effects (e.g., duplicated notifications or duplicate email triggers during network hiccups), each webhook delivery includes deduplication headers:

- `X-Webhook-Idempotency-Key`: A unique idempotency identifier. For retries of the same event/delivery, this header remains identical.
- `X-Webhook-Delivery-Id`: Unique identifier of the delivery log entry in PropChain.
- `X-Webhook-Event-Id`: Unique event identifier.
- `X-Webhook-Event`: The event name (e.g. `PROPERTY_CREATED`, `TRANSACTION_COMPLETED`).
- `X-Webhook-Signature`: HMAC-SHA256 signature computed over the raw request body using the webhook secret.

Receivers should check the `X-Webhook-Idempotency-Key` and avoid reprocessing already acknowledged events.

## Secret Rotation (#1255)

If a webhook secret is exposed or needs regular rotation:

- Call `POST /webhooks/:id/rotate-secret` (authenticated as the webhook owner).
- The previous secret is immediately invalidated in the database.
- A new 64-character hex secret is generated and returned once in the response.
- All subsequent deliveries and retries will sign payloads using the new secret.
- The secret rotation event is logged in the system audit trail (`ActivityLog`).
- Deliveries verified using the retired secret will be rejected by receiver signature verification.

## Event Replay (#1295)

Support workflows sometimes need to re-send a previously delivered (or failed) event **without re-triggering the underlying mutation**. Use the replay endpoint:

```
POST /webhooks/:id/deliveries/:deliveryId/replay
```

- Authenticated as the webhook owner; the delivery must belong to that webhook.
- The stored payload is re-sent unchanged, so the `X-Webhook-Idempotency-Key` sent to the receiver matches the original delivery and receivers can de-duplicate.
- A new delivery log row is created for the replay; the original row is left untouched.
- Inactive webhooks cannot replay (`400 Bad Request`).

### Payload size cap

Payloads larger than `WEBHOOK_MAX_PAYLOAD_BYTES` (default `65536`) are logged as a warning when triggered or replayed, so operators can spot oversized events without dropping legitimate data.

## Data Retention & Pruning

Webhook delivery records (`WebhookDeliveryLog`) are retained for 30 days by default. The retention window is configurable with `CLEANUP_WEBHOOK_LOG_DAYS`; two scheduled jobs prune delivery logs older than the threshold:

- the daily `CleanupService` run at `02:00 UTC`, and
- the webhook worker's midnight cron (`00:00 UTC`).
