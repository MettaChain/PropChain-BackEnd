# Listing API OpenAPI documentation

The two public listing routes were undocumented: `GET /properties` had no
operation, no description and no response codes, and `GET /properties/search`
exposed 25 filters that appeared nowhere in the spec — so the only way to discover
them was to read `SearchPropertiesDto`.

This documents the **listing** surface. The property resource routes (create,
update, delete, restore, status, agents, amenities, report) are documented
separately in `properties-openapi.md`.

## `GET /properties`

`listProperties` — with a description that states the two facts a caller cannot
guess from the signature (only ACTIVE, non-deleted listings; newest first by
default), and a `429` response for the 100/minute limit.

## `GET /properties/search`

`searchProperties` — 34 `@ApiQuery` entries, one per filter, covering all five
groups:

| Group | Filters |
| --- | --- |
| Price | `minPrice`, `maxPrice` |
| Location | `city`, `state`, `zipCode`, `country`, `location` |
| Type / category | `propertyType`, `category`, `tag`, `amenityType` |
| Size / age | `bedrooms`, `minBedrooms`, `maxBedrooms`, `bathrooms`, `minBathrooms`, `maxBathrooms`, `minYearBuilt`, `maxYearBuilt` |
| Geo | `lat`, `lng`, `radiusKm`, `minLat`, `maxLat`, `minLng`, `maxLng` |
| Quality | `minNeighborhoodTrustScore`, `maxNeighborhoodTrustScore` |
| Paging / sorting | `page`, `limit`, `sortBy`, `sortOrder` |
| Dates | `minExpiryDate`, `maxExpiryDate` |

### The behaviours the description now spells out

- Filters combine with **AND**; `location` alone is an **OR** across address,
  city, state and zipCode.
- Results are always ACTIVE and non-deleted **regardless of the `status`
  parameter** — a caller passing `status=DRAFT` still gets ACTIVE listings.
- `bedrooms`/`bathrooms` exact values take precedence over the `min`/`max` ranges
  when both are supplied.
- `radiusKm` is **approximated as a bounding box**, not a true radius.
- `lat` and `lng` must be supplied together, and `radiusKm` needs either a
  centre or a bounding box — otherwise `400`.
- The trust-score bounds are applied **in memory after fetching**, because the
  score is derived from the neighborhood row rather than stored. A listing with
  no neighborhood scores `null` and is excluded whenever either bound is set.

Those last three were each a plausible source of a "the API is wrong" bug report,
and none of them were discoverable before.

The project does not enable the `@nestjs/swagger` CLI plugin, so query DTOs need
explicit `@ApiProperty`. `SearchPropertiesDto` is a query DTO consumed through
`@Query()` and is documented with `@ApiQuery` on the handler rather than with
`@ApiProperty`, which is the correct modelling for query parameters.
