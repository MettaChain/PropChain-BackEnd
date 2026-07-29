-- Migration: Add soft-delete support for Transaction and Document (#918)
-- Adds deleted, deleted_at, deleted_by_id columns to transactions and documents tables.

-- Transactions: soft-delete fields
ALTER TABLE "transactions"
  ADD COLUMN IF NOT EXISTS "deleted"       BOOLEAN   NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "deleted_at"    TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "deleted_by_id" TEXT;

ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_deleted_by_id_fkey"
    FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE SET NULL
    NOT VALID;

CREATE INDEX IF NOT EXISTS "transactions_deleted_idx" ON "transactions"("deleted");

-- Documents: soft-delete fields
ALTER TABLE "documents"
  ADD COLUMN IF NOT EXISTS "deleted"       BOOLEAN   NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "deleted_at"    TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "deleted_by_id" TEXT;

ALTER TABLE "documents"
  ADD CONSTRAINT "documents_deleted_by_id_fkey"
    FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE SET NULL
    NOT VALID;

CREATE INDEX IF NOT EXISTS "documents_deleted_idx" ON "documents"("deleted");
