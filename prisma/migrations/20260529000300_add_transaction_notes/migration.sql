CREATE TABLE IF NOT EXISTS "transaction_notes" (
  "id" TEXT NOT NULL,
  "transaction_id" TEXT NOT NULL,
  "author_id" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "is_public" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "transaction_notes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "transaction_notes_transaction_id_idx" ON "transaction_notes"("transaction_id");
CREATE INDEX IF NOT EXISTS "transaction_notes_author_id_idx" ON "transaction_notes"("author_id");
ALTER TABLE "transaction_notes" ADD CONSTRAINT "transaction_notes_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transaction_notes" ADD CONSTRAINT "transaction_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON UPDATE CASCADE;
