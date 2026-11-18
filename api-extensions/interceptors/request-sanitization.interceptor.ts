import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';

export const SANITIZATION_KEY = 'request-sanitization';

export interface SanitizationOptions {
  stripHtml?: boolean;
  normalizeWhitespace?: boolean;
  trim?: boolean;
}

const DEFAULT_OPTIONS: Required<SanitizationOptions> = {
  stripHtml: true,
  normalizeWhitespace: true,
  trim: true,
};

export const SanitizeRequest = (options: SanitizationOptions = {}) =>
  SetMetadata(SANITIZATION_KEY, options);

interface SanitizableRequest {
  body?: Record<string, unknown>;
  query?: Record<string, unknown>;
}

@Injectable()
export class RequestSanitizationInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const configured =
      this.reflector.getAllAndOverride<SanitizationOptions>(SANITIZATION_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? {};
    const options = { ...DEFAULT_OPTIONS, ...configured };
    const request = context.switchToHttp().getRequest<SanitizableRequest>();

    if (request.body && typeof request.body === 'object') {
      this.sanitizeRecord(request.body, options);
    }
    if (request.query && typeof request.query === 'object') {
      this.sanitizeRecord(request.query, options);
    }

    return next.handle();
  }

  private sanitizeRecord(
    record: Record<string, unknown>,
    options: Required<SanitizationOptions>,
  ): void {
    for (const key of Object.keys(record)) {
      record[key] = this.sanitizeValue(record[key], options);
    }
  }

  private sanitizeValue(value: unknown, options: Required<SanitizationOptions>): unknown {
    if (typeof value === 'string') {
      return this.sanitizeString(value, options);
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.sanitizeValue(item, options));
    }
    if (value instanceof Date) {
      return value;
    }
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      for (const key of Object.keys(record)) {
        record[key] = this.sanitizeValue(record[key], options);
      }
      return record;
    }
    return value;
  }

  private sanitizeString(value: string, options: Required<SanitizationOptions>): string {
    let sanitized = value.replace(/[\u0000-\u001F\u007F]/g, '');
    if (options.stripHtml) {
      sanitized = sanitized.replace(/<[^>]*>/g, '').replace(/[<>]/g, '');
    }
    if (options.normalizeWhitespace) {
      sanitized = sanitized.replace(/\s+/g, ' ');
    }
    if (options.trim) {
      sanitized = sanitized.trim();
    }
    return sanitized;
  }
}
