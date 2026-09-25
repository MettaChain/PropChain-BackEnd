# Audit Module

Retention and pruning of audit-style history tables. It archives old rows to JSON files and then deletes them from Postgres.

> This module handles **retention**. Creating audit records happens elsewhere: `ActivityLog` (users), `AdminAuditInterceptor` (admin actions), `TransactionAuditService` (transactions), and blockchain audit in `src/blockchain/audit`. See [docs/View_Audit_Logs.md](../../docs/View_Audit_Logs.md).

## Files

| File                       | Purpose                                          |
| -------------------------- | ------------------------------------------------ |
| `audit-pruning.service.ts` | Daily cron: archive then delete old history rows |
| `audit-archive.config.ts`  | Archive storage settings + production guard      |
| `audit.module.ts`          | Registers the pruning service (no controller)    |

## Cron job

| Schedule                                          | Job                           |
| ------------------------------------------------- | ----------------------------- |
| `@Cron(CronExpression.DAILY)` (00:00 server time) | `AuditPruningService.prune()` |

`prune()`:

1. Computes a cutoff of **365 days** ago (hard-coded `retentionDays`).
2. For `transactionHistory` and then `loginHistory`: selects rows with `createdAt < cutoff`, writes them to `archives/<table>-<timestamp>.json`, then `deleteMany` with the same filter.
3. Tables with no expired rows are skipped (no empty files).

The archive directory is `<repo>/archives` (resolved from `dist/audit/..`) and is created if missing.

## Configuration

| Variable                | Default     | Purpose                        |
| ----------------------- | ----------- | ------------------------------ |
| `AUDIT_ARCHIVE_STORAGE` | `local`     | `local` or `s3`                |
| `AUDIT_ARCHIVE_BUCKET`  | (empty)     | S3 bucket when storage is `s3` |
| `AUDIT_ARCHIVE_REGION`  | `us-east-1` | S3 region                      |

`validateAuditStorageConfig()` throws if `NODE_ENV=production` and storage is `local`, because archives on container disk are lost on redeploy (issue #1055).

## Security model

- No HTTP surface. Archive files contain full login history (IPs, user agents), so treat the archive location as **sensitive** and restrict access to it.

## Gotchas

- ⚠️ **The S3 settings and production guard are not wired in yet.** `AuditPruningService` always writes to local disk and never calls `validateAuditStorageConfig()`. In production, archived rows are **deleted from the DB but only kept on ephemeral disk**. Implement S3 upload (and call the guard at bootstrap) before relying on this for compliance.
- `findMany` loads **all** expired rows into memory at once. The first run on a large, never-pruned database can be heavy; consider batching.
- Archive and delete are not transactional. If the process dies between `writeFile` and `deleteMany`, the next run re-archives the same rows, which duplicates them but loses nothing.
- Both files use `// @ts-nocheck`, so type errors here are not caught by `npm run build`.
- The broader data archival strategy (issue #919) lives in `src/archive/` and is exposed at `/admin/archive/*`.
