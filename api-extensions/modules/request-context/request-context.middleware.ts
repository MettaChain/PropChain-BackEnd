import { Inject, Injectable, NestMiddleware, Optional } from '@nestjs/common';
import { createHash } from 'crypto';
import { isIP } from 'net';
import type { NextFunction, Request, Response } from 'express';
import { AppLogger } from '../../../src/common/logger';
import { getCurrentRequestId } from '../../../src/common/request-id.middleware';

type Identity = { id?: string; sub?: string; apiKeyId?: string; tenantId?: string };
type ClientInfo = {
  ip?: string;
  userAgent: string;
  deviceType: string;
  platform: string;
  isBot: boolean;
};
export type ContextRequest = Request & {
  apiKey?: string;
  authUser?: Identity;
  user?: Identity;
  tenantId?: string;
  rateLimitKey?: string;
  clientInfo?: ClientInfo;
};

type KeyHeader = 'api-key' | 'x-api-key' | 'authorization';
export const REQUEST_CONTEXT_OPTIONS = Symbol('REQUEST_CONTEXT_OPTIONS');
export interface RequestContextOptions {
  apiKeyHeaders?: readonly KeyHeader[];
  clientIpHeaders?: readonly string[];
  userAgentHeader?: string;
  audit?: {
    enabled: (request: ContextRequest) => boolean;
    redactFields?: readonly string[];
    maxBytes?: number;
    level?: 'log' | 'debug' | 'warn';
  };
}

function header(request: Request, name: string): string | undefined {
  const value = request.headers[name.toLowerCase()];
  return typeof value === 'string' ? value.trim() || undefined : undefined;
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

@Injectable()
export class ApiKeyHeaderMiddleware implements NestMiddleware {
  private readonly logger = new AppLogger(ApiKeyHeaderMiddleware.name);

  constructor(
    @Optional() @Inject(REQUEST_CONTEXT_OPTIONS) private readonly options?: RequestContextOptions,
  ) {}

  use(request: ContextRequest, _response: Response, next: NextFunction): void {
    delete request.apiKey;
    for (const name of this.options?.apiKeyHeaders ?? ['api-key', 'x-api-key', 'authorization']) {
      const value = header(request, name);
      const key = name === 'authorization' ? /^ApiKey\s+([^\s,]+)$/i.exec(value ?? '')?.[1] : value;
      if (key && /^[^\s,]+$/.test(key)) {
        request.apiKey = key;
        this.logger.debug('API key presented', {
          keyHash: digest(key),
          correlationId: getCurrentRequestId(),
        });
        break;
      }
    }
    next();
  }
}

@Injectable()
export class ClientInfoMiddleware implements NestMiddleware {
  constructor(
    @Optional() @Inject(REQUEST_CONTEXT_OPTIONS) private readonly options?: RequestContextOptions,
  ) {}

  use(request: ContextRequest, _response: Response, next: NextFunction): void {
    const peer = request.socket.remoteAddress;
    let ip = request.ip ?? peer;
    const trustProxy = request.app.get('trust proxy fn') as
      ((ip: string, hop: number) => boolean) | undefined;
    if (peer && trustProxy?.(peer, 0)) {
      for (const name of this.options?.clientIpHeaders ?? ['x-forwarded-for', 'x-real-ip']) {
        // Express traverses the forwarded chain using its trusted-proxy configuration.
        const candidate =
          name.toLowerCase() === 'x-forwarded-for'
            ? header(request, name)
              ? request.ip
              : undefined
            : header(request, name);
        if (candidate && isIP(candidate)) {
          ip = candidate;
          break;
        }
      }
    }

    const userAgent = (header(request, this.options?.userAgentHeader ?? 'user-agent') ?? '').slice(
      0,
      512,
    );
    const isBot = /bot\b|crawler|spider|slurp|headless/i.test(userAgent);
    let deviceType = userAgent ? 'desktop' : 'unknown';
    if (isBot) deviceType = 'bot';
    else if (/ipad|tablet|android(?!.*mobile)/i.test(userAgent)) deviceType = 'tablet';
    else if (/mobile|iphone|ipod/i.test(userAgent)) deviceType = 'mobile';

    const platforms = [
      [/iphone|ipad|ipod/i, 'iOS'],
      [/android/i, 'Android'],
      [/windows/i, 'Windows'],
      [/macintosh|mac os/i, 'macOS'],
      [/linux/i, 'Linux'],
    ] as const;
    const platform = platforms.find(([pattern]) => pattern.test(userAgent))?.[1] ?? 'unknown';
    request.clientInfo = { ip, userAgent, deviceType, platform, isBot };
    next();
  }
}

@Injectable()
export class RateLimitKeyMiddleware implements NestMiddleware {
  use(request: ContextRequest, _response: Response, next: NextFunction): void {
    const tenant = request.tenantId ?? request.user?.tenantId ?? request.authUser?.tenantId ?? null;
    const userId = request.user?.id ?? request.user?.sub;
    const apiIdentity = request.authUser?.apiKeyId;
    const ip = request.clientInfo?.ip ?? request.ip ?? request.socket.remoteAddress ?? 'unknown';
    request.rateLimitKey = JSON.stringify(
      userId
        ? [tenant, 'user', userId]
        : apiIdentity
          ? [tenant, 'api-key', apiIdentity]
          : [tenant, 'ip', ip],
    );
    next();
  }
}

const defaultRedactions = [
  'password',
  'newpassword',
  'currentpassword',
  'confirmpassword',
  'token',
  'accesstoken',
  'refreshtoken',
  'ssn',
  'creditcard',
  'creditcardnumber',
  'cardnumber',
  'cvv',
  'apikey',
  'authorization',
  'secret',
  'privatekey',
];

function normalizeField(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Stop before serializing a large or deeply nested body. This also covers chunked requests.
function fitsLoggingBudget(body: unknown, maxBytes: number): boolean {
  let remaining = maxBytes;
  function visit(value: unknown, depth: number): boolean {
    if (depth > 32 || --remaining < 0) return false;
    if (typeof value === 'string') {
      remaining -= Buffer.byteLength(value);
    } else if (value !== null && typeof value === 'object') {
      const object = value as Record<string, unknown>;
      for (const key in object) {
        if (!Object.prototype.hasOwnProperty.call(object, key)) continue;
        remaining -= Buffer.byteLength(key);
        if (!visit(object[key], depth + 1)) return false;
      }
    }
    return remaining >= 0;
  }
  return visit(body, 0);
}

@Injectable()
export class RequestBodyAuditMiddleware implements NestMiddleware {
  private readonly logger = new AppLogger(RequestBodyAuditMiddleware.name);

  constructor(
    @Optional() @Inject(REQUEST_CONTEXT_OPTIONS) private readonly options?: RequestContextOptions,
  ) {}

  use(request: ContextRequest, _response: Response, next: NextFunction): void {
    const audit = this.options?.audit;
    try {
      if (audit && ['POST', 'PUT', 'PATCH'].includes(request.method) && audit.enabled(request)) {
        const maxBytes = audit.maxBytes ?? 4096;
        const declaredSize = Number(header(request, 'content-length') ?? 0);
        const metadata = { method: request.method, correlationId: getCurrentRequestId() };
        const fields = new Set([
          ...defaultRedactions,
          ...(audit.redactFields ?? []).map(normalizeField),
        ]);
        if (declaredSize > maxBytes || !fitsLoggingBudget(request.body, maxBytes)) {
          this.logger[audit.level ?? 'log']('Request body audit size limit exceeded', metadata);
        } else if (
          request.is('application/json') &&
          request.body &&
          typeof request.body === 'object'
        ) {
          const body = JSON.stringify(request.body, (key, value: unknown) =>
            fields.has(normalizeField(key)) ? '[REDACTED]' : value,
          );
          if (Buffer.byteLength(body) <= maxBytes) {
            this.logger[audit.level ?? 'log']('Request body audit', {
              ...metadata,
              body: JSON.parse(body) as unknown,
            });
          } else {
            this.logger[audit.level ?? 'log']('Request body audit size limit exceeded', metadata);
          }
        }
      }
    } catch {
      this.logger.warn('Request body audit unavailable', { correlationId: getCurrentRequestId() });
    }
    next();
  }
}
