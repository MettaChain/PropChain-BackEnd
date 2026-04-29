-- Migration: Add notification preferences fields to user_preferences (#370)
-- Adds: notification_frequency, notification_event_types, quiet_hours, per_event_settings

ALTER TABLE "user_preferences"
  ADD COLUMN IF NOT EXISTS "notification_frequency"   TEXT         NOT NULL DEFAULT 'INSTANT',
  ADD COLUMN IF NOT EXISTS "notification_event_types" TEXT[]       NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "quiet_hours_enabled"      BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "quiet_hours_start"        TEXT,
  ADD COLUMN IF NOT EXISTS "quiet_hours_end"          TEXT,
  ADD COLUMN IF NOT EXISTS "per_event_settings"       JSONB;
