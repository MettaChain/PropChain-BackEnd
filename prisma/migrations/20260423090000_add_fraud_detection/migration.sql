-- CreateEnum
CREATE TYPE "FraudEntityType" AS ENUM ('ACCOUNT', 'AUTH', 'PROPERTY', 'SESSION', 'TOKEN', 'USER');

-- CreateEnum
CREATE TYPE "FraudSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "FraudAlertStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'BLOCKED', 'RESOLVED', 'DISMISSED');

-- CreateTable
CREATE TABLE "fraud_alerts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "entity_type" "FraudEntityType" NOT NULL,
    "entity_id" TEXT,
    "pattern_code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "FraudSeverity" NOT NULL,
    "status" "FraudAlertStatus" NOT NULL DEFAULT 'OPEN',
    "risk_score" INTEGER NOT NULL DEFAULT 0,
    "detection_count" INTEGER NOT NULL DEFAULT 1,
    "auto_blocked" BOOLEAN NOT NULL DEFAULT false,
    "blocked_at" TIMESTAMP(3),
    "assigned_to_id" TEXT,
    "assigned_to_email" TEXT,
    "resolution_notes" TEXT,
    "metadata" JSONB,
    "first_detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fraud_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fraud_signals" (
    "id" TEXT NOT NULL,
    "alert_id" TEXT NOT NULL,
    "user_id" TEXT,
    "entity_type" "FraudEntityType" NOT NULL,
    "entity_id" TEXT,
    "pattern_code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "FraudSeverity" NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fraud_signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fraud_investigation_notes" (
    "id" TEXT NOT NULL,
    "alert_id" TEXT NOT NULL,
    "author_id" TEXT,
    "author_email" TEXT,
    "note" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fraud_investigation_notes_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "fraud_alerts"
ADD CONSTRAINT "fraud_alerts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fraud_signals"
ADD CONSTRAINT "fraud_signals_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "fraud_alerts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fraud_signals"
ADD CONSTRAINT "fraud_signals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fraud_investigation_notes"
ADD CONSTRAINT "fraud_investigation_notes_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "fraud_alerts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "fraud_alerts_user_id_idx" ON "fraud_alerts"("user_id");

-- CreateIndex
CREATE INDEX "fraud_alerts_status_severity_idx" ON "fraud_alerts"("status", "severity");

-- CreateIndex
CREATE INDEX "fraud_alerts_pattern_code_idx" ON "fraud_alerts"("pattern_code");

-- CreateIndex
CREATE INDEX "fraud_alerts_entity_type_entity_id_idx" ON "fraud_alerts"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "fraud_alerts_last_detected_at_idx" ON "fraud_alerts"("last_detected_at");

-- CreateIndex
CREATE INDEX "fraud_signals_alert_id_created_at_idx" ON "fraud_signals"("alert_id", "created_at");

-- CreateIndex
CREATE INDEX "fraud_signals_user_id_created_at_idx" ON "fraud_signals"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "fraud_signals_pattern_code_idx" ON "fraud_signals"("pattern_code");

-- CreateIndex
CREATE INDEX "fraud_investigation_notes_alert_id_created_at_idx" ON "fraud_investigation_notes"("alert_id", "created_at");
