import { Counter, Histogram, register } from 'prom-client';

/**
 * Prometheus metrics for the public listing surface (`GET /properties` and
 * `GET /properties/search`).
 *
 * These are deliberately separate from the per-handler metrics in
 * `properties-metrics.ts`: a listing feed needs to answer "how many listings
 * are we serving, how fast, and how much of that is cache-served", which is a
 * different question from "which handler is slow".
 *
 * Labels are bounded. `surface` is one of two fixed values, `outcome` one of
 * three, and `result` one of two; none of them can grow with request input.
 */
export type ListingSurface = 'list' | 'search';
export type ListingCacheOutcome = 'hit' | 'miss' | 'bypass';

const existing = <T>(name: string): T | undefined =>
  register.getSingleMetric(name) as T | undefined;

export const listingsServedTotal: Counter<'surface' | 'outcome'> =
  existing<Counter<'surface' | 'outcome'>>('properties_listings_served_total') ??
  new Counter({
    name: 'properties_listings_served_total',
    help: 'Listing responses served by surface and outcome',
    labelNames: ['surface', 'outcome'],
  });

export const listingResponseDurationSeconds: Histogram<'surface'> =
  existing<Histogram<'surface'>>('properties_listing_response_seconds') ??
  new Histogram({
    name: 'properties_listing_response_seconds',
    help: 'Listing response latency in seconds',
    labelNames: ['surface'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  });

export const listingResultsReturned: Histogram<'surface'> =
  existing<Histogram<'surface'>>('properties_listing_results_returned') ??
  new Histogram({
    name: 'properties_listing_results_returned',
    help: 'Number of listings in a single listing response',
    labelNames: ['surface'],
    buckets: [0, 1, 5, 10, 20, 50, 100],
  });

export const listingCacheLookupsTotal: Counter<'outcome'> =
  existing<Counter<'outcome'>>('properties_listing_cache_lookups_total') ??
  new Counter({
    name: 'properties_listing_cache_lookups_total',
    help: 'Listing cache lookups by outcome',
    labelNames: ['outcome'],
  });

export function listingOutcomeForStatus(status: number): 'success' | 'client_error' | 'server_error' {
  if (status >= 500) return 'server_error';
  if (status >= 400) return 'client_error';
  return 'success';
}
