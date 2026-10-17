# Investment API

Base path: `/investments` (Swagger tag: `investments`). The full OpenAPI spec is served by the Swagger UI.

| Method | Path               | Description                      | Responses     |
| ------ | ------------------ | -------------------------------- | ------------- |
| POST   | `/investments`     | Create an investment             | 201, 400, 429 |
| GET    | `/investments`     | List investments (cached)        | 200, 429      |
| GET    | `/investments/:id` | Get an investment by ID (cached) | 200, 404, 429 |

## Request body (POST)

```json
{ "propertyId": "property-123", "amount": 5000 }
```

## Caching

Reads go through the shared Redis-backed `CacheService` under the `investments` tag.
Creating an investment invalidates that tag.

## Rate limiting

`InvestmentRateLimitGuard` allows 30 requests per minute per IP. Exceeding it returns `429 Too Many Requests`.

## Tests

See `test/e2e/investments-controller.integration.spec.ts`.
