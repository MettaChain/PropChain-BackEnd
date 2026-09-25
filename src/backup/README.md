# Backup Module

PostgreSQL logical backups (`pg_dump`) with a DB-configurable schedule, count-based retention, SHA-256 checksums, restore, and admin failure alerts.

## Files

| File                | Purpose                                                  |
| ------------------- | -------------------------------------------------------- |
| `backup.service.ts` | Create / list / restore / download, scheduler, retention |
| `dto/backup.dto.ts` | `UpdateBackupScheduleDto`                                |
| `backup.module.ts`  | No controller. Routes live in the admin module           |

## Endpoints (admin only)

Exposed through [`/admin/backups/*`](../admin/README.md): list, status, get/update schedule, run now, restore, download.

## How a backup runs

1. `ensureNoActiveJobs()` rejects the request if another backup or restore is `RUNNING`.
2. A `DatabaseBackup` row is created (`RUNNING`).
3. `pg_dump --clean --if-exists --no-owner --no-privileges --format=plain --file=<path>` runs against `DATABASE_URL` (via `execFile`, not a shell).
4. A SHA-256 checksum and the file size are stored, and the status becomes `COMPLETED`.
5. **Retention** is enforced (see below).

On failure the row becomes `FAILED` and admins are notified.

## Schedule

- Stored in the `BackupScheduleConfig` table (single row, `DEFAULT_SCHEDULE_ID`), created on startup with defaults: **disabled**, cron `0 2 * * *` (02:00 daily), `retentionCount: 10`.
- `PUT /admin/backups/schedule` validates the cron expression and **re-registers the job in-process** (`CronJob` from the `cron` package, not `@nestjs/schedule`).
- Scheduled runs retry up to **3 times**, waiting **5 minutes** between attempts. Admins get a notification after each failed attempt (`retryStatus: retrying`, then `exhausted`).

## Retention policy

Count-based, not age-based: after every successful backup, all `COMPLETED` backups **beyond the newest `retentionCount`** are deleted, both the file on disk and the DB row. Manual and scheduled backups count toward the same limit.

## Restore

`POST /admin/backups/:id/restore` runs `psql --single-transaction --file <backup>` against `DATABASE_URL`.

- The dump was made with `--clean --if-exists`, so restore **drops and recreates** objects. All data written since the backup is lost.
- `--single-transaction` means a failed restore rolls back entirely.
- Restore status (`restoreStatus`, `restoredAt`, `restoredById`, `restoreError`) is recorded on the backup row.

## Configuration

| Variable              | Default         | Purpose                        |
| --------------------- | --------------- | ------------------------------ |
| `DATABASE_URL`        | required        | Source/target database         |
| `BACKUP_STORAGE_PATH` | `<cwd>/backups` | Where `.sql` files are written |
| `PG_DUMP_PATH`        | `pg_dump`       | Binary used for backups        |
| `PSQL_PATH`           | `psql`          | Binary used for restores       |

## Security model

- Only admins can trigger, restore or download backups (`/admin` is `ADMIN`-only and audited).
- Backup files contain the **entire database**, including password hashes and PII. Put `BACKUP_STORAGE_PATH` on encrypted, access-controlled storage.
- `DATABASE_URL` is passed as a CLI argument and can be visible in the process list (`ps`) while the dump runs.

## Gotchas

- `pg_dump`/`psql` must be installed in the runtime image, and their major version must be ≥ the server's.
- Files live on **local disk** by default. In containers they disappear on redeploy unless `BACKUP_STORAGE_PATH` is a mounted volume.
- The schedule timer lives in the process. With multiple replicas, **every replica** runs the scheduled backup. Enable scheduling on one instance only, or add a distributed lock (`CacheService.setNx`).
- The retry loop blocks that cron tick for up to ~10 minutes.
- `backup.module.ts` and the service use `// @ts-nocheck`.

## Tests

`backup.service.spec.ts` and `test/backup/`.
