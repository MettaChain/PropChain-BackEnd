-- CreateEnum
CREATE TYPE "DigestFrequency" AS ENUM ('DAILY', 'WEEKLY');

-- CreateTable
CREATE TABLE "digest_preferences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "frequency" "DigestFrequency" NOT NULL DEFAULT 'DAILY',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "unsubscribe_token" TEXT NOT NULL,
    "last_sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "digest_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "digest_preferences_user_id_key" ON "digest_preferences"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "digest_preferences_unsubscribe_token_key" ON "digest_preferences"("unsubscribe_token");

-- CreateIndex
CREATE INDEX "digest_preferences_user_id_idx" ON "digest_preferences"("user_id");

-- CreateIndex
CREATE INDEX "digest_preferences_enabled_frequency_idx" ON "digest_preferences"("enabled", "frequency");

-- AddForeignKey
ALTER TABLE "digest_preferences" ADD CONSTRAINT "digest_preferences_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
