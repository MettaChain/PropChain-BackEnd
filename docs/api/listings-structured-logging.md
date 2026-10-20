# Property API structured logging

`PropertiesService` uses the project's `AppLogger`. Events are a short constant message plus a metadata object with a stable `event` name, so the JSON logs produced in production can be filtered and alerted on.

This document covers the listing surface; the lifecycle events added alongside the Property API pass are in `properties-structured-logging.md`.

| `event` | Level | Fields |
| --- | --- | --- |
| `properties.search` | log | `page`, `limit`, `total`, `returned`, `filters`, `trustScoreFiltered` |
| `properties.status_transitioned` | log | `propertyId`, `from`, `to`, `actorId` |
| `properties.status_transition_noop` | log | `propertyId`, `status`, `actorId` |
| `properties.approved` | log | `propertyId`, `actorId` |
| `properties.rejected` | log | `propertyId`, `actorId` |
| `properties.bulk_status_updated` | log | `requestedCount`, `updatedCount`, `status` |
| `properties.bulk_deleted` | warn | `requestedCount`, `deletedCount` |
| `properties.bulk_delete_no_match` | warn | `requestedCount` |
| `properties.bulk_delete_conflict` | warn | `requestedCount`, `error` |
| `properties.bulk_exported` | log | `requestedCount`, `matchedCount`, `filtered` |
| `properties.expired` | log | `updatedCount` |
| `properties.agent_assigned` | log | `propertyId`, `agentId`, `actorId` |
| `properties.agent_assignment_updated` | log | `propertyId`, `agentId`, `actorId` |
| `properties.agent_assignment_removed` | log | `propertyId`, `agentId`, `actorId` |
| `properties.amenity_added` | log | `propertyId`, `amenityId`, `amenityType` |
| `properties.amenity_updated` | log | `propertyId`, `amenityId` |
| `properties.amenity_removed` | log | `propertyId`, `amenityId` |

## Two details worth knowing

`properties.search` logs **how many** filters were supplied, never their values. A slow or empty search can therefore be attributed to a query shape — "every search with 8 filters is slow" — without putting addresses, cities or owner names into the log stream. Paging and sorting are excluded from the count, since `page` and `limit` are always present because the DTO defaults them.

Every bulk event logs both `requestedCount` and `updatedCount`. Before this, a bulk delete of five ids where only two existed reported a count of two and nothing else, so a partially-failed admin operation was indistinguishable from a complete one.

No addresses or personal data are logged; `AppLogger` also redacts fields such as `password`, `token` and `secret`.
