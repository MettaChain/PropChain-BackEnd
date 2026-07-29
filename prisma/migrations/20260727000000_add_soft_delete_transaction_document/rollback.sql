-- Rollback: Remove soft-delete fields from transactions and documents

ALTER TABLE "transactions"
  DROP CONSTRAINT IF EXISTS "transactions_deleted_by_id_fkey",
  DROP COLUMN IF EXISTS "deleted",
  DROP COLUMN IF EXISTS "deleted_at",
  DROP COLUMN IF EXISTS "deleted_by_id";

DROP INDEX IF EXISTS "transactions_deleted_idx";

ALTER TABLE "documents"
  DROP CONSTRAINT IF EXISTS "documents_deleted_by_id_fkey",
  DROP COLUMN IF EXISTS "deleted",
  DROP COLUMN IF EXISTS "deleted_at",
  DROP COLUMN IF EXISTS "deleted_by_id";

DROP INDEX IF EXISTS "documents_deleted_idx";
