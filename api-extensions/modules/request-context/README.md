# Request context middleware

Import the four injectable middleware classes from
`request-context.middleware.ts` and register the classes you need with the
Nest middleware consumer for the relevant routes.

- Apply `ApiKeyHeaderMiddleware` before the guard that validates the extracted
  `request.apiKey`. Its default header order is `api-key`, `x-api-key`, then
  `Authorization: ApiKey <key>`. Set `apiKeyHeaders` to override that order.
- Apply `ClientInfoMiddleware` before consumers of `request.clientInfo`.
  Configure Express trusted proxies and have the edge proxy overwrite any
  custom forwarding headers before enabling them.
- Apply `RateLimitKeyMiddleware` after the middleware that establishes the
  authenticated identity and tenant, and before the rate limit guard that
  consumes `request.rateLimitKey`. With guard-only authentication, middleware
  runs before Nest guards and the generated key uses the client IP.
- Apply `RequestBodyAuditMiddleware` after JSON parsing and request-ID
  middleware. Provide an `audit.enabled(request)` predicate that explicitly
  permits the routes to log. Set `redactFields`, `level`, or `maxBytes` as
  needed. The default cap is 4 KiB.

Register options with
`{ provide: REQUEST_CONTEXT_OPTIONS, useValue: options }` in the module whose
middleware consumer uses these classes.
