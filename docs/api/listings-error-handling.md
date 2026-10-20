# Listing API error handling

## Bulk status update silently published listings

`POST /properties/bulk/status` mapped the requested status with

```ts
status === DRAFT ? 'DRAFT' : status === ARCHIVED ? 'ARCHIVED' : 'ACTIVE'
```

Any status that was not `DRAFT` or `ARCHIVED` fell through to **`ACTIVE`**. Asking to bulk-mark listings `SOLD` or `PENDING` therefore published every one of them instead, and returned `200` with a plausible `updatedCount`. The response looked like a success and the data was wrong.

The endpoint now accepts only `DRAFT`, `ACTIVE` and `ARCHIVED`, and answers `400` naming the supported set for anything else. Nothing is written when the request is rejected.

## Bulk delete reported ids that were never deleted

`POST /properties/bulk/delete` returned `{ deletedCount, propertyIds }` where `propertyIds` was the **requested** list, echoed back unchanged. Deleting `['real-id', 'typo-id']` answered `{ deletedCount: 1, propertyIds: ['real-id', 'typo-id'] }`, which reads as if both had been removed.

The endpoint now resolves which ids actually exist first and returns those, so `deletedCount` and `propertyIds` always agree. When nothing matches it returns `{ deletedCount: 0, propertyIds: [] }` without touching the database. This costs one extra `findMany` with `select: { id: true }` on an admin-only endpoint.

## Foreign-key violations surfaced as opaque 500s

A listing referenced by a transaction, document or commission cannot be removed. That made Prisma throw `P2003`/`P2014`, which reached the client as an unhandled `500` carrying the raw driver message — internal schema detail in an error body.

It is now a `409 Conflict` with a message that says which situation occurred, and the underlying error is logged (`properties.bulk_delete_conflict`) rather than returned. Any other error still propagates unchanged.

## Empty id lists

Both bulk endpoints now reject an empty list with `400`. The DTOs already enforced `@ArrayMinSize(1)` at the HTTP boundary, but the service methods are also called directly, and `updateMany`/`deleteMany` with an empty `in` list is a silent no-op that reports `updatedCount: 0` — indistinguishable from "nothing matched".

→ `docs/api/listings-tests.md`
