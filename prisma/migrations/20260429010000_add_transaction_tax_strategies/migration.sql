CREATE TABLE "transaction_tax_strategies" (
  "id" TEXT NOT NULL,
  "transaction_id" TEXT NOT NULL,
  "created_by_id" TEXT,
  "strategy_type" TEXT NOT NULL,
  "jurisdiction" TEXT,
  "estimated_tax_rate" DECIMAL(65,30),
  "estimated_tax_impact" DECIMAL(65,30),
  "explanation" TEXT NOT NULL,
  "metadata" JSONB,
  "version" INTEGER NOT NULL DEFAULT 1,
  "informational_only" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "transaction_tax_strategies_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "transaction_tax_strategies_transaction_id_updated_at_idx"
ON "transaction_tax_strategies"("transaction_id", "updated_at");

CREATE INDEX "transaction_tax_strategies_created_by_id_idx"
ON "transaction_tax_strategies"("created_by_id");

CREATE INDEX "transaction_tax_strategies_strategy_type_idx"
ON "transaction_tax_strategies"("strategy_type");

ALTER TABLE "transaction_tax_strategies"
ADD CONSTRAINT "transaction_tax_strategies_transaction_id_fkey"
FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "transaction_tax_strategies"
ADD CONSTRAINT "transaction_tax_strategies_created_by_id_fkey"
FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
