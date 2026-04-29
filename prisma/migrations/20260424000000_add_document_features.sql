-- Add document features: categorization, expiration, eSignature

ALTER TABLE "documents"
  ADD COLUMN IF NOT EXISTS "category"        TEXT,
  ADD COLUMN IF NOT EXISTS "tags"            TEXT[]   DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "expires_at"      TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "is_expired"      BOOLEAN  DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "expiry_notified" BOOLEAN  DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "signed_by"       TEXT,
  ADD COLUMN IF NOT EXISTS "signed_at"       TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "signature_hash"  TEXT,
  ADD COLUMN IF NOT EXISTS "audit_trail"     JSONB    DEFAULT '[]';

CREATE INDEX IF NOT EXISTS "documents_category_idx"   ON "documents"("category");
CREATE INDEX IF NOT EXISTS "documents_is_expired_idx" ON "documents"("is_expired");
CREATE INDEX IF NOT EXISTS "documents_expires_at_idx" ON "documents"("expires_at");
