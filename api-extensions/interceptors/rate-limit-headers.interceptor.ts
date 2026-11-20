import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Inject,
  Injectable,
  NestInterceptor,
  Optional,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';

export const RATE_LIMIT_SERVICE = Symbol('RATE_LIMIT_SERVICE');

export const RATE_LIMIT_HEADERS = {
  LIMIT: 'X-RateLimit-Limit',
  REMAINING: 'X-RateLimit-Remaining',
  RESET: 'X-RateLimit-Reset',
  RETRY_AFTER: 'Retry-After',
} as const;

export const DEFAULT_RATE_LIMIT = 1000;
export const DEFAULT_RETRY_AFTER_SECONDS = 60;
const WINDOW_MS = 15 * 60 * 1000;

export interface RateLimitStatus {
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}

export interface RateLimitService {
  getStatus(request: unknown): RateLimitStatus | undefined;
}

interface RateLimitResponse {
  getHeader(name: string): unknown;
  setHeader(name: string, value: string | number): unknown;
}

@Injectable()
export class RateLimitHeadersInterceptor implements NestInterceptor {
  constructor(
    @Optional()
    @Inject(RATE_LIMIT_SERVICE)
    private readonly rateLimitService?: RateLimitService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<unknown>();
    const response = http.getResponse<RateLimitResponse>();

    return next.handle().pipe(
      tap({
        next: () => this.applyStatus(response, this.statusFor(request)),
        error: (error: unknown) => {
          if (error instanceof HttpException && error.getStatus() === 429) {
            const status = this.statusFor(request);
            this.applyStatus(response, status);
            const responseBody = error.getResponse();
            const retryAfter =
              typeof responseBody === 'object' &&
              responseBody !== null &&
              'retryAfter' in responseBody
                ? Number((responseBody as { retryAfter: unknown }).retryAfter)
                : status.retryAfter;
            response.setHeader(
              RATE_LIMIT_HEADERS.RETRY_AFTER,
              Number.isFinite(retryAfter) && retryAfter !== undefined
                ? retryAfter
                : DEFAULT_RETRY_AFTER_SECONDS,
            );
          }
        },
      }),
    );
  }

  private statusFor(request: unknown): RateLimitStatus {
    const fromService = this.rateLimitService?.getStatus(request);
    if (fromService) return fromService;
    return {
      limit: DEFAULT_RATE_LIMIT,
      remaining: DEFAULT_RATE_LIMIT - 1,
      resetAt: Math.floor((Date.now() + WINDOW_MS) / 1000),
    };
  }

  private applyStatus(response: RateLimitResponse, status: RateLimitStatus): void {
    if (!response.getHeader(RATE_LIMIT_HEADERS.LIMIT)) {
      response.setHeader(RATE_LIMIT_HEADERS.LIMIT, status.limit);
    }
    if (!response.getHeader(RATE_LIMIT_HEADERS.REMAINING)) {
      response.setHeader(RATE_LIMIT_HEADERS.REMAINING, status.remaining);
    }
    if (!response.getHeader(RATE_LIMIT_HEADERS.RESET)) {
      response.setHeader(RATE_LIMIT_HEADERS.RESET, status.resetAt);
    }
  }
}
