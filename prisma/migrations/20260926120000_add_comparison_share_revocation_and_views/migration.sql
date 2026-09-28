-- AlterTable
ALTER TABLE "comparison_shares"
ADD COLUMN "revoked_at" TIMESTAMP(3),
ADD COLUMN "view_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "last_viewed_at" TIMESTAMP(3);
