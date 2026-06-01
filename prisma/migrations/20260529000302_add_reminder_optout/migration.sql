ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "opt_out_reminders" BOOLEAN NOT NULL DEFAULT false;
