import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import {
  DEFAULT_REQUEST_TIMEOUT_MS,
  REQUEST_TIMEOUT_OPTIONS,
  RequestTimeoutMiddleware,
} from './request-timeout.middleware';

/**
 * Registers the request timeout middleware for extension routes (#1603).
 *
 * Environment tuning:
 *   REQUEST_TIMEOUT_MS              default timeout (default 30000)
 *   REQUEST_TIMEOUT_MAX_MS          upper bound for header overrides (300000)
 *   REQUEST_TIMEOUT_ALLOW_OVERRIDE  `false` disables X-Request-Timeout
 */
@Module({
  providers: [
    RequestTimeoutMiddleware,
    {
      provide: REQUEST_TIMEOUT_OPTIONS,
      useValue: {
        defaultTimeoutMs:
          Number.parseInt(process.env.REQUEST_TIMEOUT_MS ?? '', 10) || DEFAULT_REQUEST_TIMEOUT_MS,
        maxTimeoutMs: Number.parseInt(process.env.REQUEST_TIMEOUT_MAX_MS ?? '', 10),
        allowClientOverride: process.env.REQUEST_TIMEOUT_ALLOW_OVERRIDE !== 'false',
      },
    },
  ],
  exports: [RequestTimeoutMiddleware],
})
export class RequestTimeoutModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestTimeoutMiddleware)
      .forRoutes({ path: 'api/extensions/*', method: RequestMethod.ALL });
  }
}
