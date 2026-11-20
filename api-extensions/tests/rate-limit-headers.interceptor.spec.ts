import { CallHandler, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { lastValueFrom, of, throwError } from 'rxjs';
import {
  DEFAULT_RATE_LIMIT,
  RATE_LIMIT_HEADERS,
  RATE_LIMIT_SERVICE,
  RateLimitHeadersInterceptor,
  RateLimitService,
} from '../interceptors/rate-limit-headers.interceptor';

describe('RateLimitHeadersInterceptor', () => {
  let headers: Map<string, string | number>;
  let response: { getHeader: jest.Mock; setHeader: jest.Mock };
  let service: { getStatus: jest.Mock };
  let interceptor: RateLimitHeadersInterceptor;

  const contextFor = (): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ url: '/properties' }),
        getResponse: () => response,
      }),
    }) as unknown as ExecutionContext;

  const run = async (callHandler: CallHandler) =>
    lastValueFrom(interceptor.intercept(contextFor(), callHandler));

  beforeEach(() => {
    headers = new Map();
    response = {
      getHeader: jest.fn((name: string) => headers.get(name)),
      setHeader: jest.fn((name: string, value: string | number) => headers.set(name, value)),
    };
    service = { getStatus: jest.fn().mockReturnValue(undefined) };
    interceptor = new RateLimitHeadersInterceptor(service);
  });

  it('sets the X-RateLimit-Limit header', async () => {
    await run({ handle: () => of('ok') });
    expect(headers.get(RATE_LIMIT_HEADERS.LIMIT)).toBe(DEFAULT_RATE_LIMIT);
  });

  it('sets the X-RateLimit-Remaining header', async () => {
    await run({ handle: () => of('ok') });
    expect(headers.get(RATE_LIMIT_HEADERS.REMAINING)).toBe(DEFAULT_RATE_LIMIT - 1);
  });

  it('sets the X-RateLimit-Reset header', async () => {
    const now = 1_700_000_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(now);
    await run({ handle: () => of('ok') });
    expect(headers.get(RATE_LIMIT_HEADERS.RESET)).toBe(Math.floor((now + 15 * 60 * 1000) / 1000));
    jest.restoreAllMocks();
  });

  it('uses values reported by the rate limit service', async () => {
    service.getStatus.mockReturnValue({
      limit: 60,
      remaining: 42,
      resetAt: 123456,
    });

    await run({ handle: () => of('ok') });
    expect(service.getStatus).toHaveBeenCalledWith(expect.objectContaining({ url: '/properties' }));
    expect(headers.get(RATE_LIMIT_HEADERS.LIMIT)).toBe(60);
    expect(headers.get(RATE_LIMIT_HEADERS.REMAINING)).toBe(42);
    expect(headers.get(RATE_LIMIT_HEADERS.RESET)).toBe(123456);
  });

  it('preserves headers already set by the rate limit guard', async () => {
    headers.set(RATE_LIMIT_HEADERS.LIMIT, 120);
    headers.set(RATE_LIMIT_HEADERS.REMAINING, 5);
    headers.set(RATE_LIMIT_HEADERS.RESET, 99);

    await run({ handle: () => of('ok') });
    expect(headers.get(RATE_LIMIT_HEADERS.LIMIT)).toBe(120);
    expect(response.setHeader).toHaveBeenCalledTimes(0);
  });

  it('sets Retry-After on a 429 response using the exception payload', async () => {
    await expect(
      run({
        handle: () =>
          throwError(() => new HttpException({ retryAfter: 12 }, HttpStatus.TOO_MANY_REQUESTS)),
      }),
    ).rejects.toThrow(HttpException);
    expect(headers.get(RATE_LIMIT_HEADERS.RETRY_AFTER)).toBe(12);
  });

  it('falls back to the service retryAfter value on a 429 response', async () => {
    service.getStatus.mockReturnValue({ limit: 10, remaining: 0, resetAt: 100, retryAfter: 7 });
    await expect(
      run({ handle: () => throwError(() => new HttpException('slow down', 429)) }),
    ).rejects.toThrow(HttpException);
    expect(headers.get(RATE_LIMIT_HEADERS.RETRY_AFTER)).toBe(7);
  });

  it('uses the default Retry-After when none is provided', async () => {
    await expect(
      run({ handle: () => throwError(() => new HttpException('slow down', 429)) }),
    ).rejects.toThrow(HttpException);
    expect(headers.get(RATE_LIMIT_HEADERS.RETRY_AFTER)).toBe(60);
  });

  it('ignores invalid retryAfter values', async () => {
    service.getStatus.mockReturnValue({
      limit: 10,
      remaining: 0,
      resetAt: 100,
      retryAfter: Number.NaN,
    });
    await expect(
      run({ handle: () => throwError(() => new HttpException({ retryAfter: 'bad' }, 429)) }),
    ).rejects.toThrow(HttpException);
    expect(headers.get(RATE_LIMIT_HEADERS.RETRY_AFTER)).toBe(60);
  });

  it('does not add Retry-After to other errors', async () => {
    await expect(
      run({ handle: () => throwError(() => new HttpException('bad', 400)) }),
    ).rejects.toThrow(HttpException);
    expect(headers.has(RATE_LIMIT_HEADERS.RETRY_AFTER)).toBe(false);
  });

  it('works without a rate limit service', async () => {
    interceptor = new RateLimitHeadersInterceptor();
    await run({ handle: () => of('ok') });
    expect(headers.get(RATE_LIMIT_HEADERS.LIMIT)).toBe(DEFAULT_RATE_LIMIT);
  });

  it('integrates with the rate limit service through dependency injection', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        RateLimitHeadersInterceptor,
        { provide: RATE_LIMIT_SERVICE, useValue: service as RateLimitService },
      ],
    }).compile();

    const injected = moduleRef.get(RateLimitHeadersInterceptor);
    service.getStatus.mockReturnValue({ limit: 5, remaining: 4, resetAt: 55 });
    await lastValueFrom(injected.intercept(contextFor(), { handle: () => of('ok') }));
    expect(headers.get(RATE_LIMIT_HEADERS.LIMIT)).toBe(5);
  });
});
