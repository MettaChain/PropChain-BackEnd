# Fraud Module

Rule-based fraud detection for logins, refresh tokens and property listings. Raises `FraudAlert` records, notifies the security team, and can **automatically block users**.

## Files

| File                            | Purpose                                                                |
| ------------------------------- | ---------------------------------------------------------------------- |
| `fraud.service.ts`              | Detection rules, alert lifecycle, auto-block, notifications            |
| `geo-location.service.ts`       | IP → country lookup used for impossible-travel checks                  |
| `device-fingerprint.service.ts` | Device fingerprint comparison                                          |
| `fraud.config.ts`               | Env-driven thresholds (see gotchas: **not yet consumed by the rules**) |
| `dto/fraud.dto.ts`              | Query / review / block DTOs used by the admin endpoints                |

This module has **no controller**. Investigator endpoints live in the admin module under `/admin/fraud/*` (see [src/admin/README.md](../admin/README.md)).

## Entry points (who calls it)

| Caller                                         | Method                               |
| ---------------------------------------------- | ------------------------------------ |
| `AuthService` failed login                     | `evaluateFailedLogin()`              |
| `AuthService` successful login                 | `evaluateSuccessfulLogin()`          |
| `AuthService` blacklisted refresh token reused | `handleTokenReuse()`                 |
| `PropertiesService.create()`                   | `evaluatePropertyCreated()`          |
| Admin manual scans                             | `runUserScan()`, `runPropertyScan()` |

## Detection rules

| Rule                            | Window  | Trigger                                    | Severity (score)                 | Auto-block      |
| ------------------------------- | ------- | ------------------------------------------ | -------------------------------- | --------------- |
| Repeated failed logins          | 30 min  | ≥ 5 failures                               | MEDIUM (58); HIGH (82) at ≥ 10   | No              |
| Many distinct IPs per account   | 24 h    | ≥ 4 IPs                                    | MEDIUM (60); HIGH (84) at ≥ 6    | No              |
| New device / IP                 | —       | Login from an IP/UA never seen for user    | LOW                              | No              |
| Shared IP across accounts       | 24 h    | ≥ 3 accounts on one IP                     | HIGH (78); CRITICAL (95) at ≥ 5  | **Yes, at ≥ 5** |
| Refresh-token reuse             | —       | Blacklisted token presented again          | CRITICAL                         | **Yes, always** |
| Login velocity                  | 5 min   | ≥ 10 successful logins                     | MEDIUM (62); HIGH (80) at ≥ 25   | No              |
| Impossible travel               | —       | ≥ 2 countries in recent history            | MEDIUM (60); HIGH (76) at ≥ 3    | No              |
| Device fingerprint mismatch     | —       | Fingerprint differs from known devices     | MEDIUM                           | No              |
| Rapid listing creation          | —       | Many listings from one owner in short time | MEDIUM; HIGH at ≥ 5              | No              |
| Duplicate property address      | —       | Same address listed by other owners        | MEDIUM; HIGH at ≥ 2 other owners | No              |
| High-value listing, new account | 14 days | Price ≥ 1,000,000 by account < 14 days old | HIGH                             | No              |

### Alert de-duplication and escalation

`createOrUpdateAlert()` looks for an **open** alert of the same type for the same user/property. If one exists, it is updated (severity only escalates, never downgrades) instead of creating a new row. If the new detection requests auto-block and the existing alert was not yet auto-blocked, the user is blocked at that point.

### What "blocked" means

`blockUserForFraud()` sets `User.isBlocked = true`, marks the alert `autoBlocked = true`, and writes an `ActivityLog` entry `USER_BLOCKED_FOR_FRAUD`. Unblocking is manual: `POST /admin/users/:id/unblock`.

## Notifications

On every new alert:

1. **Security team email**: sent to each address in `FRAUD_ALERT_RECIPIENTS`.
2. **User email**: only for `HIGH` / `CRITICAL`, and only if the user has an email address.
3. **SMS**: only for `CRITICAL`, via `SmsService`, if the user has a phone number on file.
4. **In-app**: a `Notification` row of type `FRAUD_ALERT` for any alert that has a `userId`.

Notification failures are logged and swallowed, so they never fail the originating request (e.g. the login).

## Configuration

| Variable                  | Default | Used by                              |
| ------------------------- | ------- | ------------------------------------ |
| `FRAUD_ALERT_RECIPIENTS`  | (empty) | Comma-separated security-team emails |
| `FRAUD_LOCKOUT_ATTEMPTS`  | `5`     | `fraud.config.ts` only (see gotchas) |
| `FRAUD_HIGH_FAILURES`     | `10`    | `fraud.config.ts` only               |
| `FRAUD_MEDIUM_FAILURES`   | `5`     | `fraud.config.ts` only               |
| `FRAUD_HIGH_SCORE`        | `82`    | `fraud.config.ts` only               |
| `FRAUD_MEDIUM_SCORE`      | `58`    | `fraud.config.ts` only               |
| `FRAUD_GEO_MAX_KM`        | `500`   | `fraud.config.ts` only               |
| `FRAUD_DEVICE_SIMILARITY` | `0.8`   | `fraud.config.ts` only               |

## Security model

- All read and write access to alerts goes through `/admin/fraud/*`, guarded by `JwtAuthGuard` + `RolesGuard` with `ADMIN` role, and audited by `AdminAuditInterceptor`.
- Detection runs **inline** in the request path (no queue). Keep new rules cheap: each one adds DB queries to every login.

## Gotchas

- **`fraud.config.ts` is not wired in.** The thresholds in the rules table are hard-coded in `fraud.service.ts`; changing the `FRAUD_*` env vars (other than `FRAUD_ALERT_RECIPIENTS`) currently has **no effect**. If you add configurability, read from `FRAUD_THRESHOLDS` rather than adding new literals.
- Shared-IP auto-block will lock out legitimate users behind corporate NAT or a mobile carrier CGNAT. Review `/admin/fraud/alerts?autoBlocked=true` before bulk-unblocking.
- `evaluateFailedLogin()` returns early for unknown emails: failed logins against non-existent accounts never create alerts (handled instead by login rate limiting; see [docs/LOGIN_RATE_LIMITING.md](../../docs/LOGIN_RATE_LIMITING.md)).
- Alerts whose `userId` starts with `system-` are never auto-blocked.

## Tests

`fraud.service.spec.ts`, `geo-location.service.spec.ts`, `device-fingerprint.service.spec.ts`. Run with `npx jest src/fraud`.
