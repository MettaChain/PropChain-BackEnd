-- AddColumn trust_score and last_trust_score_update to users table
ALTER TABLE "users" ADD COLUMN "trust_score" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "last_trust_score_update" TIMESTAMP(3);
