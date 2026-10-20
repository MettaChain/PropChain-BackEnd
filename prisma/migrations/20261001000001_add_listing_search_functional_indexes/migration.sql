-- Functional and array indexes for the public listing/search read path.
--
-- `GET /properties/search` filters with Prisma's `mode: 'insensitive'`, which
-- compiles to `LOWER("column") = LOWER($1)`. A plain btree index on the raw
-- column is unusable for that expression, so the existing `@@index([city, state])`
-- and `@@index([propertyType])` never got chosen by the planner for the most
-- common filters in the product. Indexing the expression itself fixes that.
--
-- Each index leads with the listing predicate (status + soft delete) so the
-- filtered search is one index seek.

-- Granular location filters (city / state equality).
CREATE INDEX "properties_listing_lower_city_idx"
ON "properties" ("status", "is_deleted", LOWER("city"));

CREATE INDEX "properties_listing_lower_state_idx"
ON "properties" ("status", "is_deleted", LOWER("state"));

-- Property type and category filters.
CREATE INDEX "properties_listing_lower_property_type_idx"
ON "properties" ("status", "is_deleted", LOWER("property_type"));

-- Category is optional, so only rows that have one are indexed.
CREATE INDEX "properties_listing_lower_category_idx"
ON "properties" ("status", "is_deleted", LOWER("category"))
WHERE "category" IS NOT NULL;

-- `where: { tags: { has: tag } }` is an array containment test, which needs GIN.
CREATE INDEX "properties_tags_gin_idx"
ON "properties" USING GIN ("tags");

-- The amenity filter joins on a case-insensitive amenity_type.
CREATE INDEX "property_amenities_lower_amenity_type_idx"
ON "property_amenities" (LOWER("amenity_type"));
