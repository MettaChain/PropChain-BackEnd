# Listing & Investment API

## ListingAPI

- `GET /listings?page=1&limit=10` – paginated listings. `limit` is capped at 100.
  Response: `{ data: [...], meta: { page, limit, total, totalPages } }`
- `GET /listings/health` – health check for the listing service (`status: ok | error`).
- All listing endpoints use `TraceInterceptor`, so each request gets an `X-Trace-Id` response header and trace logs.

## InvestmentAPI

- `InvestmentsService.calculateRoi(amountInvested, currentValue)` returns profit and ROI percentage.
- Unit tests: `src/investments/investments.service.spec.ts`.
