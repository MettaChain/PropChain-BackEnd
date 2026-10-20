# Property API Redis caching

`PropertiesService.findOne` (`GET /properties/:id`) is cached per property for 60
seconds through `PropertiesCacheService`, which uses the shared `CacheService`
(Redis when configured).

- Key: `properties:detail:<propertyId>`; TTL 60s, so a detail view can be up to a
  minute stale. The key is also registered under `CACHE_TAGS.PROPERTIES`, so the
  existing tag invalidation covers it.
- Read-through only: cache errors, or no cache being available, fall back to the
  database, so caching can never fail a request.
- A lookup that finds nothing is **not** cached. The controller turns `null` into
  a 404, and caching that would hide a property created moments later for a whole
  TTL.
- Search and listing results are deliberately **not** cached: their result sets
  change on almost every write and their query keys are unbounded.

Every write path drops the affected key, so a stale entry cannot outlive a write
by more than the TTL: `create`, `update`, `remove`, `restore`, `transitionStatus`
(including approve/reject), agent assignment create/update/remove, and the amenity
endpoints. `transitionStatus` invalidates *before* its follow-up `findOne`, so the
new status is never read from the cache. Bulk operations invalidate by tag, as
before.

`PropertiesCacheService` is injected with `@Optional()`, so the service still
constructs without it and existing unit tests are unaffected.
