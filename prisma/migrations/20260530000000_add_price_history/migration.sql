-- Migration: Add price history tracking for properties

CREATE TABLE "price_history" (
    "id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "previous_price" DECIMAL(18,2) NOT NULL,
    "new_price" DECIMAL(18,2) NOT NULL,
    "price_change_percentage" DECIMAL(10,2),
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" TEXT NOT NULL,
    "user_role" TEXT NOT NULL,
    "change_reason" VARCHAR(500),
    "ip_address" TEXT,
    "user_agent" TEXT,
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_history_pkey" PRIMARY KEY ("id")
);

-- Create indexes for performance optimization
CREATE INDEX "price_history_property_id_timestamp_idx"
    ON "price_history" ("property_id", "timestamp" DESC);

CREATE INDEX "price_history_property_id_created_at_idx"
    ON "price_history" ("property_id", "created_at" DESC);

CREATE INDEX "price_history_user_id_idx"
    ON "price_history" ("user_id");

CREATE INDEX "price_history_timestamp_idx"
    ON "price_history" ("timestamp");

-- Add foreign key constraints
ALTER TABLE "price_history"
    ADD CONSTRAINT "price_history_property_id_fkey"
    FOREIGN KEY ("property_id") REFERENCES "properties" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "price_history"
    ADD CONSTRAINT "price_history_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
