# Listing API retry with backoff

`retryListingQuery` (`src/properties/listing-retry.util.ts`) retries a failed
listing read with exponential backoff — doubling from the base delay, capped,
with up to 50% jitter — and rethrows the last error once the attempts run out.

Both search branches run their database reads through it: the transaction that
pages and counts, and the trust-score branch's unbounded fetch.

## What counts as transient

`isTransientListingReadError` retries only failures that mean *try again*, and
nothing else:

| Retried | Not retried |
| --- | --- |
| Prisma `P1001` (cannot reach server), `P1002` (server timed out), `P1008` (operations timed out), `P1017` (pool closed) | every other Prisma code, including `PrismaClientKnownRequestError` |
| `PrismaClientInitializationError` | |
| `ECONNRESET`, `ECONNREFUSED`, `EPIPE`, `ETIMEDOUT`, `EAI_AGAIN`, `ENOTFOUND`, `socket hang up`, pool/connection timeouts | |

The distinction matters: a query the database rejected on its own terms — a bad
filter, a type mismatch, a missing relation — will fail identically on the next
attempt, so retrying it only adds latency to a request that was always going to
fail.

## Deliberately short

**Two attempts**, 50 ms base delay, 400 ms ceiling. This sits in front of an
interactive request, so the goal is to ride out a single blip, not to survive an
outage. A client that waits longer than about half a second would rather get an
error and retry than hold a connection and a worker occupied.

The predicate and the schedule are both tuned for that reason — a generic retry
helper with the settings commonly used for outbound HTTP calls would be far too
patient for an interactive read.

## Not retried, deliberately

- **Writes.** Retrying an `update`/`create` after a dropped connection risks
  applying it twice. Only reads are wrapped.
- **The whole transaction.** `$transaction([...])` is retried as a unit, since
  the page and the count must agree.

`sleep` and `random` are injectable, so the delay schedule is testable without
waiting in real time.

## Relationship to the geocoding helper

`properties-retry.md` documents a sibling helper, `retryWithBackoff`
(`src/properties/retry.util.ts`), for the outbound geocoding call. The two share
a backoff schedule but differ deliberately in their `isRetryable` predicate and
their timeouts: a provider `4xx` should not be repeated, a database `4xx` should
not be repeated either, but a provider timeout and a database timeout warrant
different amounts of patience. They are kept as separate modules so each can be
tuned for its own dependency; consolidating them once both land is a reasonable
follow-up.
