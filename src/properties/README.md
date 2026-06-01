Properties Module
=================

Overview
--------

This module exposes the REST endpoints used to create and manage property listings.

Primary endpoints
-----------------

- `POST /properties` — Create a property (requires authentication). Performs duplicate-address checks, optional auto-geocoding, sets initial status and associates owner.
- `GET /properties` — List public properties (returns ACTIVE listings by default).
- `GET /properties/search` — Advanced search with filters (price range, location, propertyType, bedrooms, bathrooms, bounding box / radius, pagination, sorting).
- `GET /properties/:id` — Retrieve single property (includes owner, agents, documents).
- `PUT /properties/:id` — Update property (owner/agent/admin as allowed). Re-geocodes when address changes unless coordinates provided.
- `DELETE /properties/:id` — Delete property (admin only).
- `PATCH /properties/:id/status` — Transition property lifecycle (requires authentication).

Domain behavior & important notes
---------------------------------

- Duplicate address prevention: creation/update rejects properties with an identical address/city/state/zip/country combination.
- Geocoding: when latitude/longitude are not provided, the module attempts to resolve coordinates via `GeocodingService`.
- Price/Decimal handling: `price`, `squareFeet`, `lotSize`, and some fees are stored using `Decimal` in Prisma — service converts these to/from numbers/Decimal.
- Lifecycle: Properties move through a defined workflow (DRAFT → PENDING → ACTIVE → UNDER_CONTRACT → SOLD). Status transitions are validated by `property-status.constants.ts`.
- Side-effects: Creation triggers fraud evaluation and cache invalidation; updates may re-geocode and update related caches.

Developer notes
---------------

- Controller: [src/properties/properties.controller.ts](src/properties/properties.controller.ts#L1)
- Service: [src/properties/properties.service.ts](src/properties/properties.service.ts#L1)
- DTOs: [src/properties/dto/property.dto.ts](src/properties/dto/property.dto.ts#L1)
- Tests: unit tests live in [src/properties/*.spec.ts] and integration/e2e tests in `test/e2e`.
- Prisma model: see `Property` in [prisma/schema.prisma](prisma/schema.prisma#L1).
- When writing tests: use the FakePrisma pattern (or an ephemeral test database). Mock `GeocodingService` and `FraudService` to avoid external calls.
- Be careful with `Decimal` conversions in assertions — convert to numbers or strings consistently.

Performance & scaling
---------------------

- Listing and search endpoints should paginate results (use `page`/`limit`). Heavy search filters may require DB indexes — check Prisma migrations and add composite indexes when needed.
