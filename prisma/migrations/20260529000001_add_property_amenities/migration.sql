CREATE TABLE IF NOT EXISTS "property_amenities" (
  "id" TEXT NOT NULL,
  "property_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "amenity_type" TEXT NOT NULL,
  "description" TEXT,
  "is_available" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "property_amenities_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "property_amenities_property_id_idx" ON "property_amenities"("property_id");
CREATE INDEX IF NOT EXISTS "property_amenities_amenity_type_idx" ON "property_amenities"("amenity_type");
ALTER TABLE "property_amenities" ADD CONSTRAINT "property_amenities_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
