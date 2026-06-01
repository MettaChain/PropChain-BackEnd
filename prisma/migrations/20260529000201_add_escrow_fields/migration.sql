ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "escrow_status" TEXT;
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "escrow_amount" DECIMAL(65,30);
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "escrow_released_at" TIMESTAMP(3);
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "payment_status" TEXT;
