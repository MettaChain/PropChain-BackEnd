# Property API database query optimisation

## Stable pagination ordering

`GET /properties` and `GET /properties/search` page with `skip`/`take`, but neither
guaranteed a total order. Rows with the same value in the sort column could be
returned in a different order on each call, so a row could appear on page 1 and
again on page 2, or be skipped entirely.

Both paths now order by the requested sort column **and** `id` as a tie-breaker.
`GET /properties` additionally defaults to `createdAt desc, id desc` instead of
leaving the order to the database.

## Composite indexes for the listing read path

Every listing query filters `is_deleted = false AND status = 'ACTIVE'`. Before this
change the schema only had `status` and `is_deleted` indexed separately, plus
`(status, created_at)` and `(status, price)` from
`prisma/migrations/20260325120000_composite_indexes`, so the planner had to
intersect indexes and then sort.

`prisma/migrations/20261001000000_add_property_listing_indexes` adds:

| Index | Serves |
| --- | --- |
| `(status, is_deleted, created_at DESC)` | default listing order |
| `(status, is_deleted, price)` | price-sorted listing and price-range search |
| `(city, state, status, is_deleted)` | location search restricted to public listings |

The matching `@@index` entries are declared on the `Property` model in
`prisma/schema.prisma`.

## Owner listings

`findByOwnerId` gained the same `id` tie-breaker so owner dashboard paging is
stable too.
