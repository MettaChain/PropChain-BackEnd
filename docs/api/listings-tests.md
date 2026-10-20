# Listing API tests

## Unit — `src/properties/properties.service.spec.ts`

Extends the existing suite (which covers create, lookups, remove and restore) over the listing surface that had none:

- **`searchProperties`** — paging arithmetic and the reported total, the defaults (`page 1`, `20` per page, newest first), that the query is forced to `ACTIVE` and non-deleted whatever `status` the caller passed, the computed `neighborhoodTrustScore` annotation, the in-memory trust-score branch (and that it does not use the transaction), and geo validation: `lat` without `lng` rejected, a radius with no centre rejected, and a radius converted to a bounding box.
- **`transitionStatus` / `approve` / `reject`** — `404` for an unknown listing, `403` for a caller who is neither owner, agent nor admin, `400` for a transition the workflow disallows, an idempotent no-op that does not write, the three roles that *are* allowed, and that approve goes to `ACTIVE` while reject goes to `ARCHIVED`.
- **Bulk operations** — each supported status, the rejection of an unsupported one, the empty-list guard, that `propertyIds` reports only ids that existed, that a no-match short-circuits, and that a `P2003` becomes a conflict rather than a 500.
- **Agent assignment** — `404`/`403`/role/duplicate guards, the 3% default commission, `404` on updating or removing an assignment that does not exist, and the contact-detail fallback in `getAgents`.
- **Amenities** — `404` for an unknown listing, refusal to touch an amenity that belongs to a different listing, the `isAvailable` default, and the oldest-first ordering.

The Prisma mock gained the `updateMany`, `deleteMany`, `count`, `$transaction`, `propertyAgent`, `propertyAmenity` and `user` delegates these suites drive.

## Integration — `test/e2e/properties-controller.integration.spec.ts`

Extends the existing HTTP suite (public reads, the 404 contract, search routing and query coercion, create validation, role enforcement) over the routes it did not touch:

- **Status lifecycle** — the route is open to any authenticated caller and forwards the caller id *and* role to the service, requires authentication, rejects a status outside the enum with `400`, surfaces a refused transition as `400`, and that `approve`/`reject` are admin-only.
- **Bulk operations** — admin-only, id-list validation (empty and malformed), the reported ids, a foreign-key conflict surfacing as `409`, and the optional export filter.
- **Agent assignment** — authentication, argument forwarding for create/update/remove, a missing assignment surfacing as `404`, and that the read route is unauthenticated.
- **Amenities** — body validation, create, the unauthenticated read, and both-ids forwarding on update and delete.
- **Report download** — that a PDF is streamed with its attachment headers, that a missing listing is `404`, and that an unexpected failure returns `500` **without** leaking the underlying error text into the body.

Run with `npx jest src/properties/properties.service.spec.ts test/e2e/properties-controller.integration.spec.ts`.
