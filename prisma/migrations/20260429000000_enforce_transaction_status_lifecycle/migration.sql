UPDATE "transactions"
SET "status" = 'CANCELLED'
WHERE "status" = 'FAILED';

ALTER TYPE "TransactionStatus" RENAME TO "TransactionStatus_old";

CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');

ALTER TABLE "transactions"
ALTER COLUMN "status" DROP DEFAULT,
ALTER COLUMN "status" TYPE "TransactionStatus"
USING ("status"::text::"TransactionStatus"),
ALTER COLUMN "status" SET DEFAULT 'PENDING';

DROP TYPE "TransactionStatus_old";
