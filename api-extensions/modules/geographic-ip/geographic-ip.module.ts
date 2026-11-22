import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigurableGeoLookupProvider } from './geo-lookup.provider';
import {
  DEFAULT_GEO_CACHE_PREFIX,
  DEFAULT_GEO_CACHE_TTL_SECONDS,
  GEO_CACHE,
  GEO_LOOKUP_PROVIDER,
  GEOGRAPHIC_IP_OPTIONS,
} from './geographic-ip.types';
import { GeographicIpMiddleware } from './geographic-ip.middleware';
import { RedisGeoCache } from './redis-geo.cache';

/**
 * Registers the geographic IP middleware for extension routes (#1610).
 *
 * The Redis cache is only provided when `REDIS_URL` is configured; otherwise
 * lookups run uncached. `REDIS_GEO_CACHE_TTL_SECONDS` and
 * `REDIS_GEO_CACHE_PREFIX` tune the cache behaviour.
 */
@Module({
  providers: [
    GeographicIpMiddleware,
    { provide: GEO_LOOKUP_PROVIDER, useClass: ConfigurableGeoLookupProvider },
    {
      provide: GEOGRAPHIC_IP_OPTIONS,
      useValue: {
        cacheTtlSeconds:
          Number.parseInt(process.env.REDIS_GEO_CACHE_TTL_SECONDS ?? '', 10) ||
          DEFAULT_GEO_CACHE_TTL_SECONDS,
        cachePrefix: process.env.REDIS_GEO_CACHE_PREFIX ?? DEFAULT_GEO_CACHE_PREFIX,
      },
    },
    ...(process.env.REDIS_URL
      ? [
          {
            provide: GEO_CACHE,
            useFactory: () => new RedisGeoCache(process.env.REDIS_URL as string),
          },
        ]
      : []),
  ],
  exports: [GeographicIpMiddleware],
})
export class GeographicIpModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(GeographicIpMiddleware)
      .forRoutes({ path: 'api/extensions/*', method: RequestMethod.ALL });
  }
}
