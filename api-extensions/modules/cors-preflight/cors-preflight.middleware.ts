/**
 * CORS preflight middleware (#1604).
 *
 * Answers `OPTIONS` requests for extension endpoints with a 204 and the
 * configured access-control headers, then lets every other method fall through
 * to the router. The global policy in `src/main.ts` remains the owner of
 * ordinary responses; this middleware only terminates preflight.
 *
 * Origins can be exact strings, a `*` wildcard, or regular expressions. A
 * wildcard is never combined with credentials: when credentials are enabled
 * only explicitly matching origins are reflected.
 */

import { Inject, Injectable, NestMiddleware, Optional } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

export type CorsOrigin = string | RegExp;

export const CORS_PREFLIGHT_OPTIONS = Symbol('CORS_PREFLIGHT_OPTIONS');

export interface CorsPreflightOptions {
  allowedOrigins?: ReadonlyArray<CorsOrigin>;
  allowedMethods?: ReadonlyArray<string>;
  allowedHeaders?: ReadonlyArray<string>;
  allowCredentials?: boolean;
  maxAgeSeconds?: number;
  successStatus?: number;
}

export const DEFAULT_CORS_METHODS: ReadonlyArray<string> = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
];

export const DEFAULT_CORS_HEADERS: ReadonlyArray<string> = [
  'Content-Type',
  'Authorization',
  'X-Request-Id',
  'X-Language',
  'API-Version',
];

export const DEFAULT_CORS_MAX_AGE_SECONDS = 600;

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function mergeVary(current: unknown, value: string): string {
  const existing = Array.isArray(current) ? current.map(String) : current ? [String(current)] : [];
  return Array.from(new Set([...existing, value])).join(', ');
}

@Injectable()
export class CorsPreflightMiddleware implements NestMiddleware {
  private readonly allowedOrigins: ReadonlyArray<CorsOrigin>;
  private readonly allowedMethods: ReadonlyArray<string>;
  private readonly allowedHeaders: ReadonlyArray<string>;
  private readonly allowCredentials: boolean;
  private readonly maxAgeSeconds: number;
  private readonly successStatus: number;

  constructor(
    @Optional()
    @Inject(CORS_PREFLIGHT_OPTIONS)
    options?: CorsPreflightOptions | null,
  ) {
    this.allowedOrigins =
      options?.allowedOrigins && options.allowedOrigins.length > 0 ? options.allowedOrigins : ['*'];
    this.allowedMethods =
      options?.allowedMethods && options.allowedMethods.length > 0
        ? options.allowedMethods.map((method) => method.toUpperCase())
        : DEFAULT_CORS_METHODS;
    this.allowedHeaders =
      options?.allowedHeaders && options.allowedHeaders.length > 0
        ? options.allowedHeaders
        : DEFAULT_CORS_HEADERS;
    this.allowCredentials = options?.allowCredentials ?? false;
    this.maxAgeSeconds =
      options?.maxAgeSeconds !== undefined && options.maxAgeSeconds >= 0
        ? options.maxAgeSeconds
        : DEFAULT_CORS_MAX_AGE_SECONDS;
    this.successStatus = options?.successStatus ?? 204;
  }

  use(req: Request, res: Response, next: NextFunction): void {
    if ((req.method ?? '').toUpperCase() !== 'OPTIONS') {
      next();
      return;
    }

    const origin = headerValue(req.headers.origin);
    const allowOrigin = this.resolveOrigin(origin);

    res.setHeader('Access-Control-Allow-Methods', this.allowedMethods.join(', '));
    res.setHeader('Access-Control-Allow-Headers', this.allowedHeaders.join(', '));
    res.setHeader('Access-Control-Max-Age', String(this.maxAgeSeconds));

    if (allowOrigin) {
      res.setHeader('Access-Control-Allow-Origin', allowOrigin);
      if (this.allowCredentials) {
        res.setHeader('Access-Control-Allow-Credentials', 'true');
      }
      if (allowOrigin !== '*') {
        res.setHeader('Vary', mergeVary(res.getHeader('Vary'), 'Origin'));
      }
    }

    res.status(this.successStatus).end();
  }

  private resolveOrigin(origin: string | undefined): string | null {
    const hasWildcard = this.allowedOrigins.some((entry) => entry === '*');
    if (hasWildcard && !this.allowCredentials) {
      return '*';
    }
    if (!origin) {
      return null;
    }
    for (const entry of this.allowedOrigins) {
      if (typeof entry === 'string' && entry !== '*' && entry === origin) {
        return origin;
      }
      if (entry instanceof RegExp) {
        entry.lastIndex = 0;
        if (entry.test(origin)) {
          return origin;
        }
      }
    }
    return null;
  }
}
