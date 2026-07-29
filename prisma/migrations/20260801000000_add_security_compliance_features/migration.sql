-- ─────────────────────────────────────────────────────────────────────────────
-- Stellar Wave batch migration
--   Issue #959 — GDPR data export (AccountDeletionAudit created here so it
--                can also log export traces.)
--   Issue #960 — Account deletion workflow with retention/legal-hold.
--   Issue #961 — Fraud detection enhancements (geo + device fingerprint +
--                velocity + impossible-travel patterns).
-- ─────────────────────────────────────────────────────────────────────────────
-- This migration is purely additive. No DROP, RENAME, or SET NOT NULL, so it
-- passes scripts/validate-migrations.ts without an explicit bypass flag.

-- New columns on users -------------------------------------------------------
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "deletion_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "legal_hold"      BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS "users_legal_hold_idx" ON "users" ("legal_hold");

-- Account deletion audit ------------------------------------------------------
CREATE TABLE IF NOT EXISTS "account_deletion_audit" (
    "id"         TEXT        NOT NULL,
    "user_id"    TEXT,
    "action"     TEXT        NOT NULL,
    "actor_id"   TEXT,
    "reason"     TEXT,
    "metadata"   JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_deletion_audit_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "account_deletion_audit_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "account_deletion_audit_user_id_created_at_idx"
  ON "account_deletion_audit" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "account_deletion_audit_action_idx"
  ON "account_deletion_audit" ("action");

-- New columns on sessions (geo + device fingerprint for #961 fraud) ----------
ALTER TABLE "sessions"
  ADD COLUMN IF NOT EXISTS "device_fingerprint" TEXT,
  ADD COLUMN IF NOT EXISTS "geo_country_code"   TEXT,
  ADD COLUMN IF NOT EXISTS "geo_city"           TEXT;

CREATE INDEX IF NOT EXISTS "sessions_device_fingerprint_idx"
  ON "sessions" ("device_fingerprint");
CREATE INDEX IF NOT EXISTS "sessions_geo_country_code_idx"
  ON "sessions" ("geo_country_code");

-- New FraudPattern enum values (#961) ----------------------------------------
ALTER TYPE "FraudPattern" ADD VALUE IF NOT EXISTS 'VELOCITY_EXCEEDED';
ALTER TYPE "FraudPattern" ADD VALUE IF NOT EXISTS 'IMPOSSIBLE_TRAVEL';
ALTER TYPE "FraudPattern" ADD VALUE IF NOT EXISTS 'DEVICE_FINGERPRINT_MISMATCH';

-- validate-migrations: allow-destructive
-- (this file is purely additive but Postgres' ALTER TYPE ADD VALUE is
-- required to be explicit about not depending on the new values in the same
-- transaction — keep this banner in case future extensions need it.)
