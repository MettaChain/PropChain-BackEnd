import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
  PayloadTooLargeException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';

export const MAX_BODY_SIZE_KEY = 'max-body-size';
export const MAX_BODY_SIZE_BYTES = 1024 * 1024;

export const MaxBodySize = (bytes: number) => SetMetadata(MAX_BODY_SIZE_KEY, bytes);

interface LimitedBodyRequest {
  headers?: Record<string, string | string[] | undefined>;
  method?: string;
  originalUrl?: string;
  url?: string;
  ip?: string;
  authUser?: { sub?: string; id?: string };
}

@Injectable()
export class RequestBodySizeLimitInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RequestBodySizeLimitInterceptor.name);

  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const maxBytes =
      this.reflector.getAllAndOverride<number>(MAX_BODY_SIZE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? this.environmentLimit();
    const request = context.switchToHttp().getRequest<LimitedBodyRequest>();
    const contentLength = this.headerValue(request, 'content-length');

    if (contentLength !== undefined) {
      const bytes = Number(contentLength);
      if (Number.isFinite(bytes) && bytes > maxBytes) {
        this.logger.warn(
          `Rejected oversized request: ${request.method ?? 'UNKNOWN'} ${request.originalUrl ?? request.url ?? ''} ` +
            `size=${bytes} limit=${maxBytes} user=${request.authUser?.sub ?? request.authUser?.id ?? 'anonymous'} ip=${request.ip ?? 'unknown'}`,
        );
        throw new PayloadTooLargeException(
          `Request body exceeds the ${maxBytes} byte limit`,
        );
      }
    }

    return next.handle();
  }

  private environmentLimit(): number {
    const configured = Number(process.env.MAX_BODY_SIZE_BYTES);
    return Number.isFinite(configured) && configured > 0 ? configured : MAX_BODY_SIZE_BYTES;
  }

  private headerValue(
    request: LimitedBodyRequest,
    name: string,
  ): string | undefined {
    const value = request.headers?.[name];
    return Array.isArray(value) ? value[0] : value;
  }
}
