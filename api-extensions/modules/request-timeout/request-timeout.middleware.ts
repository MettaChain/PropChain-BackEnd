/**
 * Request timeout middleware (#1603).
 *
 * Starts a timer for every request. When it expires before the response
 * finishes, the request is marked as timed out, the event is logged for
 * monitoring, and a `RequestTimeoutException` is passed to Nest's exception
 * layer (HTTP 408). If the response has already begun, the socket is destroyed
 * because headers can no longer be replaced.
 *
 * The timeout can be tuned per route with `X-Request-Timeout` (milliseconds,
 * or a value suffixed with `ms`/`s`), bounded by `maxTimeoutMs`.
 */

import {
  Inject,
  Injectable,
  Logger,
  NestMiddleware,
  Optional,
  RequestTimeoutException,
} from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

export const REQUEST_TIMEOUT_OPTIONS = Symbol('REQUEST_TIMEOUT_OPTIONS');
export const REQUEST_TIMEOUT_HEADER = 'x-request-timeout';
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
export const DEFAULT_MAX_TIMEOUT_MS = 300_000;
export const DEFAULT_MIN_TIMEOUT_MS = 100;

export interface RequestTimeoutOptions {
  defaultTimeoutMs?: number;
  maxTimeoutMs?: number;
  minTimeoutMs?: number;
  allowClientOverride?: boolean;
  timeoutHeader?: string;
}

interface RequestWithTimeout extends Request {
  timedOut?: boolean;
  timeoutMs?: number;
}

interface ParsedDuration {
  value: number;
  unit: 'ms' | 's';
}

/**
 * Parse `500`, `500ms` or `2s` into milliseconds. Returns null for anything
 * that is not a non-negative number with an optional supported unit.
 */
export function parseTimeoutHeader(raw: string | undefined): number | null {
  if (!raw) {
    return null;
  }
  const match = /^(\d+(?:\.\d+)?)(ms|s)?$/i.exec(raw.trim());
  if (!match?.[1]) {
    return null;
  }
  const value = Number.parseFloat(match[1]);
  if (!Number.isFinite(value) || value < 0) {
    return null;
  }
  const unit = (match[2]?.toLowerCase() ?? 'ms') as ParsedDuration['unit'];
  const milliseconds = unit === 's' ? value * 1_000 : value;
  return Math.round(milliseconds);
}

@Injectable()
export class RequestTimeoutMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RequestTimeoutMiddleware.name);
  private readonly defaultTimeoutMs: number;
  private readonly maxTimeoutMs: number;
  private readonly minTimeoutMs: number;
  private readonly allowClientOverride: boolean;
  private readonly timeoutHeader: string;

  constructor(
    @Optional()
    @Inject(REQUEST_TIMEOUT_OPTIONS)
    options?: RequestTimeoutOptions | null,
  ) {
    this.defaultTimeoutMs =
      options?.defaultTimeoutMs && options.defaultTimeoutMs > 0
        ? options.defaultTimeoutMs
        : DEFAULT_REQUEST_TIMEOUT_MS;
    this.maxTimeoutMs =
      options?.maxTimeoutMs && options.maxTimeoutMs > 0
        ? options.maxTimeoutMs
        : DEFAULT_MAX_TIMEOUT_MS;
    this.minTimeoutMs =
      options?.minTimeoutMs && options.minTimeoutMs > 0
        ? options.minTimeoutMs
        : DEFAULT_MIN_TIMEOUT_MS;
    this.allowClientOverride = options?.allowClientOverride ?? true;
    this.timeoutHeader = (options?.timeoutHeader ?? REQUEST_TIMEOUT_HEADER).toLowerCase();
  }

  use(req: Request, res: Response, next: NextFunction): void {
    const request = req as RequestWithTimeout;
    const timeoutMs = this.resolveTimeout(request);
    request.timeoutMs = timeoutMs;

    let settled = false;
    const clear = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      res.removeListener('finish', clear);
      res.removeListener('close', clear);
    };

    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      res.removeListener('finish', clear);
      res.removeListener('close', clear);
      request.timedOut = true;

      this.logger.warn(
        `Request timed out after ${timeoutMs}ms: ${request.method ?? 'UNKNOWN'} ${
          request.originalUrl ?? request.url ?? ''
        } (ip=${request.ip ?? 'unknown'})`,
      );

      if (res.headersSent || res.writableEnded) {
        // The response already started; sending a 408 is impossible now.
        res.destroy();
        return;
      }
      next(new RequestTimeoutException(`Request timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    if (typeof timer.unref === 'function') {
      timer.unref();
    }
    res.once('finish', clear);
    res.once('close', clear);

    next();
  }

  private resolveTimeout(request: Request): number {
    if (!this.allowClientOverride) {
      return this.defaultTimeoutMs;
    }
    const header = request.headers[this.timeoutHeader];
    const raw = Array.isArray(header) ? header[0] : header;
    const requested = parseTimeoutHeader(raw);
    if (requested === null) {
      return this.defaultTimeoutMs;
    }
    return Math.min(Math.max(requested, this.minTimeoutMs), this.maxTimeoutMs);
  }
}
