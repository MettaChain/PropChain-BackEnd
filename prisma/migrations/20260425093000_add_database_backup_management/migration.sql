CREATE TYPE "BackupStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');
CREATE TYPE "BackupTrigger" AS ENUM ('MANUAL', 'SCHEDULED');
CREATE TYPE "RestoreStatus" AS ENUM ('IDLE', 'RUNNING', 'COMPLETED', 'FAILED');

CREATE TABLE "database_backups" (
  "id" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "file_path" TEXT NOT NULL,
  "status" "BackupStatus" NOT NULL DEFAULT 'PENDING',
  "trigger" "BackupTrigger" NOT NULL,
  "size_bytes" BIGINT,
  "checksum" TEXT,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  "error_message" TEXT,
  "initiated_by_id" TEXT,
  "restore_status" "RestoreStatus" NOT NULL DEFAULT 'IDLE',
  "restored_at" TIMESTAMP(3),
  "restore_error" TEXT,
  "restored_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "database_backups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "backup_schedule_configs" (
  "id" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "cron_expression" TEXT NOT NULL,
  "retention_count" INTEGER NOT NULL DEFAULT 10,
  "last_run_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "backup_schedule_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "database_backups_filename_key" ON "database_backups"("filename");
CREATE INDEX "database_backups_status_started_at_idx" ON "database_backups"("status", "started_at");
CREATE INDEX "database_backups_restore_status_restored_at_idx" ON "database_backups"("restore_status", "restored_at");
CREATE INDEX "database_backups_trigger_created_at_idx" ON "database_backups"("trigger", "created_at");

ALTER TABLE "database_backups"
ADD CONSTRAINT "database_backups_initiated_by_id_fkey"
FOREIGN KEY ("initiated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "database_backups"
ADD CONSTRAINT "database_backups_restored_by_id_fkey"
FOREIGN KEY ("restored_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "backup_schedule_configs" ("id", "enabled", "cron_expression", "retention_count", "created_at", "updated_at")
VALUES ('default', false, '0 2 * * *', 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
