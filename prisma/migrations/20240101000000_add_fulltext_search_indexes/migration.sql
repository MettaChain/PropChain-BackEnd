-- Add full-text search support for properties
ALTER TABLE "properties" ADD COLUMN "search_vector" tsvector;

CREATE INDEX "properties_search_vector_idx" ON "properties" USING gin("search_vector");

CREATE OR REPLACE FUNCTION update_property_search_vector()
RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.address, '') || ' ' || coalesce(NEW.city, '') || ' ' || coalesce(NEW.state, '')), 'C');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER property_search_vector_update
  BEFORE INSERT OR UPDATE ON "properties"
  FOR EACH ROW
  EXECUTE FUNCTION update_property_search_vector();
