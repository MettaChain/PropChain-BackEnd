import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import {
  CORS_PREFLIGHT_OPTIONS,
  CorsOrigin,
  CorsPreflightMiddleware,
} from './cors-preflight.middleware';

function parseOrigins(raw: string | undefined): ReadonlyArray<CorsOrigin> {
  if (!raw) {
    return ['*'];
  }
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const regex = /^\/(.*)\/([a-z]*)$/i.exec(entry);
      if (regex) {
        try {
          return new RegExp(regex[1] as string, regex[2]);
        } catch {
          return entry;
        }
      }
      return entry;
    });
}

function parseList(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * Registers the CORS preflight middleware for extension routes (#1604).
 *
 * Tuning environment variables:
 *   CORS_ALLOWED_ORIGINS  comma-separated; `/pattern/flags` entries are regex
 *   CORS_ALLOWED_METHODS  comma-separated HTTP methods
 *   CORS_ALLOWED_HEADERS  comma-separated request headers
 *   CORS_ALLOW_CREDENTIALS `true` to send Allow-Credentials
 *   CORS_MAX_AGE          preflight cache lifetime in seconds
 */
@Module({
  providers: [
    CorsPreflightMiddleware,
    {
      provide: CORS_PREFLIGHT_OPTIONS,
      useValue: {
        allowedOrigins: parseOrigins(process.env.CORS_ALLOWED_ORIGINS),
        allowedMethods: parseList(process.env.CORS_ALLOWED_METHODS),
        allowedHeaders: parseList(process.env.CORS_ALLOWED_HEADERS),
        allowCredentials: process.env.CORS_ALLOW_CREDENTIALS === 'true',
        maxAgeSeconds: Number.parseInt(process.env.CORS_MAX_AGE ?? '', 10),
      },
    },
  ],
  exports: [CorsPreflightMiddleware],
})
export class CorsPreflightModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(CorsPreflightMiddleware)
      .forRoutes({ path: 'api/extensions/*', method: RequestMethod.ALL });
  }
}
