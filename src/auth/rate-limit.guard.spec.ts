import { RateLimitGuard } from './guards/rate-limit.guard';
import { RateLimitService } from './rate-limit.service';
import { ExecutionContext, HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

function makeContext(overrides: Partial<any> = {}): ExecutionContext {
  const request = {
    method: 'POST',
    url: '/auth/login',
    route: { path: '/auth/login' },
    headers: {},
    ip: '1.2.3.4',
    connection: {},
    socket: {},
    user: null,
    ...overrides,
  };
  const response = { setHeader: jest.fn() };
  return {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('RateLimitGuard - auth/signup endpoints', () => {
  let guard: RateLimitGuard;
  let rateLimitService: jest.Mocked<RateLimitService>;
  let reflector: Reflector;

  const notExceeded = { limit: 5, remaining: 4, reset: 9999999999, isExceeded: false };
  const exceeded = { limit: 5, remaining: 0, reset: 9999999999, isExceeded: true, retryAfter: 60 };

  beforeEach(() => {
    reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false); // skip = false

    rateLimitService = {
      checkIpRateLimit: jest.fn().mockResolvedValue(notExceeded),
      checkUserRateLimit: jest.fn().mockResolvedValue(notExceeded),
      checkEndpointRateLimit: jest.fn().mockResolvedValue({ ...notExceeded, limit: 0 }),
      getHeaders: jest.fn().mockReturnValue({}),
    } as any;

    guard = new RateLimitGuard(reflector, rateLimitService);
  });

  it('allows request when rate limit is not exceeded', async () => {
    const ctx = makeContext();
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('blocks login endpoint when IP rate limit exceeded', async () => {
    rateLimitService.checkIpRateLimit.mockResolvedValue(exceeded);
    const ctx = makeContext();
    await expect(guard.canActivate(ctx)).rejects.toThrow(HttpException);
  });

  it('blocks register endpoint when IP rate limit exceeded', async () => {
    rateLimitService.checkIpRateLimit.mockResolvedValue(exceeded);
    const ctx = makeContext({ url: '/auth/register', route: { path: '/auth/register' } });
    await expect(guard.canActivate(ctx)).rejects.toThrow(HttpException);
  });

  it('returns 429 with retryAfter when rate limit exceeded', async () => {
    rateLimitService.checkIpRateLimit.mockResolvedValue(exceeded);
    const ctx = makeContext();
    try {
      await guard.canActivate(ctx);
      fail('should have thrown');
    } catch (e: any) {
      expect(e).toBeInstanceOf(HttpException);
      expect(e.getStatus()).toBe(429);
      const body = e.getResponse();
      expect(body).toMatchObject({ retryAfter: 60 });
    }
  });

  it('skips rate limiting when SkipRateLimit is set', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true); // skip = true
    rateLimitService.checkIpRateLimit.mockResolvedValue(exceeded);
    const ctx = makeContext();
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('checks endpoint-specific limit for login', async () => {
    rateLimitService.checkEndpointRateLimit.mockResolvedValue({
      ...exceeded,
      limit: 5,
    });
    const ctx = makeContext();
    await expect(guard.canActivate(ctx)).rejects.toThrow(HttpException);
  });
});
