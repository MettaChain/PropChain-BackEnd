import { Counter, Histogram, register } from 'prom-client';

/**
 * Prometheus metrics for the Property API. Labels are bounded: `operation` is a
 * controller handler name and `outcome` one of three values, so cardinality
 * cannot grow with property input. Metrics are looked up before being created so
 * hot reloads and test suites do not register them twice.
 */
export type PropertiesOutcome = 'success' | 'client_error' | 'server_error';

export const propertiesRequestsTotal: Counter<'operation' | 'outcome'> =
  (register.getSingleMetric('properties_requests_total') as Counter<'operation' | 'outcome'>) ??
  new Counter({
    name: 'properties_requests_total',
    help: 'Property API requests by handler and outcome',
    labelNames: ['operation', 'outcome'],
  });

export const propertiesRequestDurationSeconds: Histogram<'operation'> =
  (register.getSingleMetric('properties_request_duration_seconds') as Histogram<'operation'>) ??
  new Histogram({
    name: 'properties_request_duration_seconds',
    help: 'Property API handler latency in seconds',
    labelNames: ['operation'],
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  });

export function propertiesOutcomeForStatus(status: number): PropertiesOutcome {
  if (status >= 500) return 'server_error';
  if (status >= 400) return 'client_error';
  return 'success';
}
