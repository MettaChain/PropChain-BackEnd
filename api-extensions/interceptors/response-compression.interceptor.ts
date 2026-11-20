import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, map } from 'rxjs';
import { deflateSync, gzipSync, Z_DEFAULT_COMPRESSION } from 'zlib';

export const RESPONSE_COMPRESSION_KEY = 'response-compression';
export const DEFAULT_COMPRESSION_THRESHOLD = 1024;

export interface ResponseCompressionOptions {
  threshold?: number;
  level?: number;
}

export const CompressResponse = (options: ResponseCompressionOptions = {}) =>
  SetMetadata(RESPONSE_COMPRESSION_KEY, options);

type CompressionEncoding = 'gzip' | 'deflate';

interface CompressionRequest {
  headers?: Record<string, string | string[] | undefined>;
}

interface CompressionResponse {
  getHeader(name: string): unknown;
  setHeader(name: string, value: string | number): unknown;
}

@Injectable()
export class ResponseCompressionInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const options =
      this.reflector.getAllAndOverride<ResponseCompressionOptions>(RESPONSE_COMPRESSION_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? {};
    const threshold = this.numberOption(
      options.threshold,
      process.env.RESPONSE_COMPRESSION_THRESHOLD,
      DEFAULT_COMPRESSION_THRESHOLD,
    );
    const level = this.numberOption(
      options.level,
      process.env.RESPONSE_COMPRESSION_LEVEL,
      Z_DEFAULT_COMPRESSION,
    );
    const http = context.switchToHttp();
    const request = http.getRequest<CompressionRequest>();
    const response = http.getResponse<CompressionResponse>();

    return next
      .handle()
      .pipe(map((data) => this.compress(data, request, response, threshold, level)));
  }

  private numberOption(
    value: number | undefined,
    environment: string | undefined,
    fallback: number,
  ) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const parsed = Number(environment);
    return Number.isFinite(parsed) && environment !== undefined ? parsed : fallback;
  }

  private compress(
    data: unknown,
    request: CompressionRequest,
    response: CompressionResponse,
    threshold: number,
    level: number,
  ): unknown {
    const encoding = this.preferredEncoding(request);
    if (!encoding) return data;

    const payload =
      typeof data === 'string' ? Buffer.from(data) : Buffer.isBuffer(data) ? data : null;
    if (!payload || payload.length < threshold) return data;

    const compressed =
      encoding === 'gzip' ? gzipSync(payload, { level }) : deflateSync(payload, { level });
    response.setHeader('Content-Encoding', encoding);
    response.setHeader('Content-Length', compressed.length);
    response.setHeader('Vary', 'Accept-Encoding');
    return compressed;
  }

  private preferredEncoding(request: CompressionRequest): CompressionEncoding | null {
    const raw = request.headers?.['accept-encoding'];
    const header = Array.isArray(raw) ? raw.join(',') : raw;
    if (!header) return null;

    const encodings = header
      .toLowerCase()
      .split(',')
      .map((entry) => entry.split(';')[0].trim());
    if (encodings.includes('gzip')) return 'gzip';
    if (encodings.includes('deflate')) return 'deflate';
    return null;
  }
}
