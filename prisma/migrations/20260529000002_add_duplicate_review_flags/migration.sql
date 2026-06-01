ALTER TABLE "property_duplicates" ADD COLUMN IF NOT EXISTS "flagged_for_review" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "property_duplicates" ADD COLUMN IF NOT EXISTS "review_notes" TEXT;
ALTER TABLE "property_duplicates" ADD COLUMN IF NOT EXISTS "is_resolved" BOOLEAN NOT NULL DEFAULT false;
