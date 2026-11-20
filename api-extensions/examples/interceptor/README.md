# Example: NestJS Interceptor with RxJS Operators

`ResponseEnvelopeInterceptor` implements `NestInterceptor` and demonstrates:

| Concern                 | RxJS operator           | What it does                                               |
| ----------------------- | ----------------------- | ---------------------------------------------------------- |
| Response transformation | `map`                   | Wraps handler output in `{ success, data, meta }`          |
| Logging / timing        | `tap`                   | Logs method, path and duration on success and failure      |
| Error handling          | `timeout`, `catchError` | Maps timeouts to 408 and unknown errors to a sanitized 500 |

## Lifecycle

```
request -> [code before next.handle()] -> route handler -> [operators piped on next.handle()] -> response
```

## Files

- `response-envelope.interceptor.ts` - the interceptor
- `interceptor-example.controller.ts` - controller-scoped usage (plus notes on method/global scope)
- `response-envelope.interceptor.spec.ts` - unit tests using a mocked `ExecutionContext` and `CallHandler`

## Registering globally

```ts
// main.ts
app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());

// or, with DI, in a module
providers: [{ provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor }];
```
