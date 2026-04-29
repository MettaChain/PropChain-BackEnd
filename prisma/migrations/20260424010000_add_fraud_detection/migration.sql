CREATE TYPE "FraudSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "FraudStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'RESOLVED', 'DISMISSED');
CREATE TYPE "FraudPattern" AS ENUM (
  'EXCESSIVE_FAILED_LOGINS',
  'SHARED_IP_MULTIPLE_ACCOUNTS',
  'MULTIPLE_IPS_FOR_ACCOUNT',
  'NEW_DEVICE_LOGIN',
  'TOKEN_REUSE',
  'RAPID_PROPERTY_LISTINGS',
  'DUPLICATE_PROPERTY_ADDRESS',
  'HIGH_VALUE_NEW_ACCOUNT_LISTING'
);

CREATE TABLE "fraud_alerts" (
  "id" TEXT NOT NULL,
  "user_id" TEXT,
  "property_id" TEXT,
  "transaction_id" TEXT,
  "session_id" TEXT,
  "pattern" "FraudPattern" NOT NULL,
  "severity" "FraudSeverity" NOT NULL,
  "status" "FraudStatus" NOT NULL DEFAULT 'OPEN',
  "score" INTEGER NOT NULL DEFAULT 0,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "evidence" JSONB,
  "auto_blocked" BOOLEAN NOT NULL DEFAULT false,
  "first_detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "occurrence_count" INTEGER NOT NULL DEFAULT 1,
  "assigned_to_id" TEXT,
  "resolved_by_id" TEXT,
  "resolved_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fraud_alerts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fraud_investigation_notes" (
  "id" TEXT NOT NULL,
  "alert_id" TEXT NOT NULL,
  "actor_id" TEXT,
  "action" TEXT,
  "note" TEXT NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fraud_investigation_notes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "fraud_alerts_status_severity_idx" ON "fraud_alerts"("status", "severity");
CREATE INDEX "fraud_alerts_user_id_status_idx" ON "fraud_alerts"("user_id", "status");
CREATE INDEX "fraud_alerts_property_id_status_idx" ON "fraud_alerts"("property_id", "status");
CREATE INDEX "fraud_alerts_pattern_status_idx" ON "fraud_alerts"("pattern", "status");
CREATE INDEX "fraud_alerts_last_detected_at_idx" ON "fraud_alerts"("last_detected_at");
CREATE INDEX "fraud_investigation_notes_alert_id_created_at_idx"
  ON "fraud_investigation_notes"("alert_id", "created_at");
CREATE INDEX "fraud_investigation_notes_actor_id_idx" ON "fraud_investigation_notes"("actor_id");

ALTER TABLE "fraud_alerts"
  ADD CONSTRAINT "fraud_alerts_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "fraud_alerts"
  ADD CONSTRAINT "fraud_alerts_property_id_fkey"
  FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "fraud_alerts"
  ADD CONSTRAINT "fraud_alerts_transaction_id_fkey"
  FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "fraud_alerts"
  ADD CONSTRAINT "fraud_alerts_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "fraud_alerts"
  ADD CONSTRAINT "fraud_alerts_assigned_to_id_fkey"
  FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "fraud_alerts"
  ADD CONSTRAINT "fraud_alerts_resolved_by_id_fkey"
  FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "fraud_investigation_notes"
  ADD CONSTRAINT "fraud_investigation_notes_alert_id_fkey"
  FOREIGN KEY ("alert_id") REFERENCES "fraud_alerts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "fraud_investigation_notes"
  ADD CONSTRAINT "fraud_investigation_notes_actor_id_fkey"
  FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
