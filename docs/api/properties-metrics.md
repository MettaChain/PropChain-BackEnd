# Property API Prometheus metrics

Exposed on the existing `/metrics` endpoint:

| Metric | Type | Labels |
| --- | --- | --- |
| `properties_requests_total` | counter | `operation` (controller handler name), `outcome` (`success`, `client_error`, `server_error`) |
| `properties_request_duration_seconds` | histogram | `operation` |

`PropertiesMetricsInterceptor` records both for every `PropertiesController` handler. Labels are bounded (a fixed set of handler names and three outcomes), so cardinality does not grow with property input.

`properties_requests_total{operation="create",outcome="client_error"}` is the cheapest way to see a spike in bad property payloads, and the duration histogram shows which handler dominates API latency. The pre-existing `properties_total` counter (properties created) is unchanged.
