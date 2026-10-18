/**
 * Retry helper for the listing read path.
 *
 * Scoped deliberately to database reads: the predicate here is about the
 * connection and the pool, not about an upstream HTTP provider. Anything the
 * database rejected on its own terms - a bad filter, a missing row, a type
 * mismatch - is not retried, because the same query will fail identically next
 * time and retrying only adds latency to a request that was always going to fail.
 */
export interface ListingRetryOptions {
  /** Total attempts including the first. Default 2. */
  attempts?: number;
  /** Delay before the first retry in ms; doubles each retry. Default 50. */
  baseDelayMs?: number;
  /** Ceiling on any single delay in ms. Default 400. */
  maxDelayMs?: number;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
  /** Injectable for tests; returns a value in [0, 1). */
  random?: () => number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Prisma error codes that mean "try again", as opposed to "this query is
 * wrong". `P1001` cannot reach the server, `P1002` the server timed out,
 * `P1008` operations timed out, `P1017` the pool was closed.
 */
const TRANSIENT_PRISMA_CODES = new Set(['P1001', 'P1002', 'P1008', 'P1017']);

const TRANSIENT_NETWORK =
  /ECONNRESET|ECONNREFUSED|EPIPE|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|socket hang up|Client has encountered a connection error|connection pool timeout|Timeout expired/i;

/**
 * Whether a failed listing read looks transient — a dropped connection, a
 * timeout, or the pool running dry under load — and so is worth one more try.
 */
export function isTransientListingReadError(error: unknown): boolean {
  if (!error) return false;

  const code = (error as { code?: string }).code;
  if (typeof code === 'string' && TRANSIENT_PRISMA_CODES.has(code)) return true;

  const name = (error as { name?: string }).name ?? '';
  if (name === 'PrismaClientInitializationError' || name === 'PrismaClientKnownRequestError') {
    // A known request error carries an explicit code; if it is not one of the
    // transient ones the query itself is at fault, so only the initialisation
    // variant (connection unavailable) is retryable here.
    if (name === 'PrismaClientKnownRequestError') return false;
  }

  const message = (error as { message?: string }).message ?? '';
  return TRANSIENT_NETWORK.test(message);
}

/** Delay before retry number `retry` (1-based): exponential, capped, with jitter. */
export function listingBackoffDelayMs(
  retry: number,
  baseDelayMs: number,
  maxDelayMs: number,
  random: () => number,
): number {
  const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** (retry - 1));
  return Math.round(exponential * (0.5 + random() * 0.5));
}

/**
 * Run a listing read, retrying transient failures with exponential backoff and
 * jitter. The last error is rethrown once the attempts run out.
 *
 * Only two attempts by default and a much shorter ceiling than a generic
 * retry helper: this sits in front of an interactive request, so the point is
 * to ride out a blip, not to survive an outage. A client that waits longer than
 * a second would rather get an error and retry than hold a connection open.
 */
export async function retryListingQuery<T>(
  fn: () => Promise<T>,
  options: ListingRetryOptions = {},
): Promise<T> {
  const {
    attempts = 2,
    baseDelayMs = 50,
    maxDelayMs = 400,
    sleep = defaultSleep,
    random = Math.random,
  } = options;

  let lastError: unknown;
  for (let attempt = 1; attempt <= Math.max(1, attempts); attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || !isTransientListingReadError(error)) throw error;
      await sleep(listingBackoffDelayMs(attempt, baseDelayMs, maxDelayMs, random));
    }
  }
  throw lastError;
}
