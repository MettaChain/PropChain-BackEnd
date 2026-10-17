import { Counter, Histogram, register } from 'prom-client';

/**
 * Prometheus metrics for the Investment API. Labels are bounded: `operation` is a
 * handler name and `outcome` one of three values. Metrics are looked up before
 * being created so hot reloads and test suites do not register them twice.
 */
export type InvestmentOutcome = 'success' | 'client_error' | 'server_error';

export const investmentRequestsTotal: Counter<'operation' | 'outcome'> =
  (register.getSingleMetric('investment_requests_total') as Counter<'operation' | 'outcome'>) ??
  new Counter({
    name: 'investment_requests_total',
    help: 'Investment API requests by handler and outcome',
    labelNames: ['operation', 'outcome'],
  });

export const investmentRequestDurationSeconds: Histogram<'operation'> =
  (register.getSingleMetric('investment_request_duration_seconds') as Histogram<'operation'>) ??
  new Histogram({
    name: 'investment_request_duration_seconds',
    help: 'Investment API handler latency in seconds',
    labelNames: ['operation'],
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  });

export function investmentOutcomeForStatus(status: number): InvestmentOutcome {
  if (status >= 500) return 'server_error';
  if (status >= 400) return 'client_error';
  return 'success';
}
