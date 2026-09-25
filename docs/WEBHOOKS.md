# Webhook System Documentation

## Overview
PropChain supports transactional and event-driven webhooks for asynchronous notifications. Webhooks are delivered via HTTP POST requests with cryptographically verified payloads.

## Delivery & Retry Semantics (#1256)

### Retry Backoff Schedule
When an endpoint responds with a non-2xx status or a network timeout/error occurs, the webhook delivery is automatically scheduled for retry using a deterministic backoff schedule:

| Attempt | Failure Sequence | Backoff Delay | Next Retry Timestamp |
|---------|------------------|---------------|----------------------|
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

## Data Retention & Pruning
Webhook delivery records (`WebhookDeliveryLog`) are retained for 30 days. A scheduled cleanup worker runs daily at midnight (`00:00 UTC`) to prune delivery log entries older than the retention threshold.
