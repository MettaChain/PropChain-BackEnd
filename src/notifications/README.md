# Notifications Module

In-app notifications (persisted in the DB), real-time delivery over WebSocket, cross-replica presence tracking in Redis, and SMS delivery through pluggable providers.

## Files

| File                          | Purpose                                                            |
| ----------------------------- | ------------------------------------------------------------------ |
| `notifications.controller.ts` | REST inbox for the current user                                    |
| `notifications.service.ts`    | Create, schedule, read and delete notifications; offline delivery  |
| `notifications.gateway.ts`    | Socket.IO gateway on namespace `/notifications`                    |
| `redis-presence.service.ts`   | "Is user X connected on any replica?"                              |
| `sms.service.ts`              | `SmsService` + Twilio / AWS SNS / Mock providers, opt-out handling |

## REST endpoints

All require `JwtAuthGuard` and operate only on the caller's notifications.

| Method   | Path                          | Description      |
| -------- | ----------------------------- | ---------------- |
| `GET`    | `/notifications`              | List             |
| `GET`    | `/notifications/unread-count` | Unread count     |
| `PATCH`  | `/notifications/:id/read`     | Mark one as read |
| `PATCH`  | `/notifications/read-all`     | Mark all as read |
| `DELETE` | `/notifications/:id`          | Delete           |

## WebSocket gateway

- Namespace: **`/notifications`**. CORS origins come from `CORS_ORIGINS`.
- The client identifies itself with a `userId` **query parameter** in the handshake (`io('/notifications', { query: { userId } })`). Sockets without it are disconnected. **No JWT is verified** (see gotchas).
- Server → client events include user-targeted notifications (`sendToUser`) and broadcast events such as `document:expired`.
- On connect, `deliverPending(userId)` flushes notifications created while the user was offline.

### Presence (multi-replica)

Redis keys (both with **30 s TTL**):

```
presence:user:{userId}      HASH  socketId → pod id
presence:socket:{socketId}  STRING userId  (reverse lookup)
```

- The gateway refreshes TTLs every **10 s**, so an entry survives two missed heartbeats and expires after a pod crash.
- `cleanupStaleEntries` runs `@Cron(EVERY_MINUTE)` and deletes empty user hashes.
- The pod ID comes from `HOSTNAME`, then `POD_NAME`, then falls back to `pid-<pid>`.

## SMS

The provider is selected by `SMS_PROVIDER`:

| Value            | Provider        | Required env                                                    |
| ---------------- | --------------- | --------------------------------------------------------------- |
| `mock` (default) | Logs only       | none                                                            |
| `twilio`         | Twilio REST API | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` |
| `aws`            | AWS SNS         | `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`      |

`SmsService` honours user opt-outs, stored in a JSON file at `SMS_OPTOUT_STORAGE` (default `./data/sms-optout.json`). Provider errors are returned as `{ success: false, error }`, not thrown.

## Configuration

| Variable                                       | Purpose                                              |
| ---------------------------------------------- | ---------------------------------------------------- |
| `CORS_ORIGINS`                                 | Comma-separated allowed origins for the WebSocket    |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` | Presence store                                       |
| `SMS_PROVIDER`                                 | `mock` / `twilio` / `aws`                            |
| `TWILIO_*`, `AWS_*`                            | Provider credentials (see table above)               |
| `SMS_OPTOUT_STORAGE`                           | Opt-out list file (default `./data/sms-optout.json`) |
| `HOSTNAME` / `POD_NAME`                        | Replica identity for presence                        |

## Consumers

Fraud (security alerts), Backup (failure alerts), Transactions (`handleTransactionUpdate`) and Documents (expiry broadcasts) all publish through this module.

## Gotchas

- **WebSocket auth is trust-the-client.** Any client can connect with another user's `userId` and receive their real-time notifications. Verify a JWT from `handshake.auth.token` in `handleConnection` before relying on this channel for sensitive data.
- The opt-out list is a **local file**. On multi-replica or ephemeral-disk deployments, opt-outs are not shared and can be lost on redeploy.
- `document:expired` is emitted to **all** connected sockets (`server.emit`), not to the document owner. Don't put sensitive fields in that payload.
- The default `mock` SMS provider silently "succeeds". Production must set `SMS_PROVIDER` explicitly.
- Scheduled notifications (`scheduleNotification`) are persisted and can be cancelled with `cancelScheduledNotification(id)`.

## Tests

`notifications.gateway.spec.ts`, `redis-presence.service.spec.ts`. Run with `npx jest src/notifications`.
