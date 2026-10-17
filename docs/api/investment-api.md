# Investment API

- **Error handling** (`src/investments/investment-errors.ts`): `toInvestmentHttpError` passes HTTP exceptions through and maps unknown errors to a generic 500 after logging them.
- **Structured logging** (`src/investments/investment-logger.ts`): `logInvestmentEvent(event, context)` writes one JSON line per event under the `InvestmentAPI` logger.
- **Prometheus metrics** (`src/investments/investment-metrics.ts`): `investment_requests_total{operation,outcome}` and `investment_request_duration_seconds{operation}`, exposed via the existing `/metrics` endpoint.
