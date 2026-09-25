/**
 * Security headers middleware.
 *
 * Every route gets the strict DEFAULT_CONTENT_SECURITY_POLICY. The Swagger UI
 * route gets a slightly wider policy (still script-src 'self') so its locally
 * served swagger-ui-dist assets render.
 */

import type { NextFunction, Request, Response } from 'express';
import {
  DEFAULT_CONTENT_SECURITY_POLICY,
  SWAGGER_SERVERS,
  buildDocsContentSecurityPolicy,
  isSwaggerDocsPath,
} from './swagger.config';

export function createSecurityHeadersMiddleware(
  docsServerUrls: string[] = SWAGGER_SERVERS.map((s) => s.url),
): (req: Request, res: Response, next: NextFunction) => void {
  const docsCsp = buildDocsContentSecurityPolicy(docsServerUrls);

  return (req, res, next) => {
    res.setHeader(
      'Content-Security-Policy',
      isSwaggerDocsPath(req.path) ? docsCsp : DEFAULT_CONTENT_SECURITY_POLICY,
    );
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  };
}
