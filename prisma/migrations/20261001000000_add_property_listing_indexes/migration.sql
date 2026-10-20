-- Composite indexes for the public Property/Listing read paths.
--
-- Every listing query filters `is_deleted = false AND status = 'ACTIVE'`. The
-- existing indexes cover `status` and `is_deleted` separately and
-- `(status, created_at)` / `(status, price)`, so the database has to intersect
-- two or three indexes for the commonest query in the product and then sort.
-- These replace that with a single index seek.

-- Default listing order: active, not deleted, newest first (GET /properties and
-- GET /properties/search with no explicit sort).
CREATE INDEX "properties_status_deleted_created_at_idx"
ON "properties" ("status", "is_deleted", "created_at" DESC);

-- Price-sorted listing order and price-range search.
CREATE INDEX "properties_status_deleted_price_idx"
ON "properties" ("status", "is_deleted", "price");

-- Location search (city/state) restricted to the public listing set.
CREATE INDEX "properties_city_state_status_deleted_idx"
ON "properties" ("city", "state", "status", "is_deleted");
