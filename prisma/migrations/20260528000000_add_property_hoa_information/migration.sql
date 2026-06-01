ALTER TABLE "properties"
ADD COLUMN "hoa_name" TEXT,
ADD COLUMN "hoa_monthly_fee" DECIMAL,
ADD COLUMN "hoa_amenities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "hoa_contact_info" TEXT;
