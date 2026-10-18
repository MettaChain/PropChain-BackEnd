# InvestmentAPI

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/investments/health` | Health check (DB connectivity) – #1407 |
| GET | `/investments/:propertyId/metrics` | Investment metrics (capRate, roi, rentalYield, cashFlow) |

- **Retry with backoff (#1406):** DB reads retry up to 3 times with exponential backoff (100ms, 200ms, 400ms).
- **Distributed tracing (#1408):** Requests pass through the shared `TraceInterceptor` (trace IDs, sampling via `TRACE_SAMPLE_RATE`).
- **Injection hardening (#1409):** `propertyId` must match `^[A-Za-z0-9_-]{1,64}$`; queries use Prisma parameterized calls only.
