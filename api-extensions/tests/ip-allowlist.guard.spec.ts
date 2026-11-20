import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AllowIps, IpAllowlistGuard } from '../guards/ip-allowlist.guard';

describe('IpAllowlistGuard', () => {
  const originalEnv = process.env;
  let guard: IpAllowlistGuard;

  class DefaultController {}
  const defaultHandler = () => undefined;

  const contextFor = (request: Record<string, unknown> = {}, target?: unknown): ExecutionContext =>
    ({
      getHandler: () => target ?? defaultHandler,
      getClass: () => target ?? DefaultController,
      switchToHttp: () => ({ getRequest: () => request }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.IP_ALLOWLIST;
    guard = new IpAllowlistGuard(new Reflector());
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('allows an individually allowlisted IPv4 address', () => {
    process.env.IP_ALLOWLIST = '10.0.0.1';
    expect(guard.canActivate(contextFor({ ip: '10.0.0.1' }))).toBe(true);
  });

  it('denies a non-allowlisted IPv4 address', () => {
    process.env.IP_ALLOWLIST = '10.0.0.1';
    expect(() => guard.canActivate(contextFor({ ip: '203.0.113.5' }))).toThrow(ForbiddenException);
  });

  it('matches an IPv4 CIDR range', () => {
    process.env.IP_ALLOWLIST = '192.168.1.0/24';
    expect(guard.canActivate(contextFor({ ip: '192.168.1.42' }))).toBe(true);
    expect(() => guard.canActivate(contextFor({ ip: '192.168.2.42' }))).toThrow(ForbiddenException);
  });

  it('matches partial CIDR prefixes across byte boundaries', () => {
    process.env.IP_ALLOWLIST = '10.8.0.0/13';
    expect(guard.canActivate(contextFor({ ip: '10.15.2.3' }))).toBe(true);
    expect(() => guard.canActivate(contextFor({ ip: '10.16.2.3' }))).toThrow(ForbiddenException);
  });

  it('uses the first hop of X-Forwarded-For', () => {
    process.env.IP_ALLOWLIST = '203.0.113.5';
    const request = {
      headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.9' },
      ip: '10.0.0.9',
    };
    expect(guard.canActivate(contextFor(request))).toBe(true);
  });

  it('accepts array-valued X-Forwarded-For headers', () => {
    process.env.IP_ALLOWLIST = '203.0.113.5';
    const request = { headers: { 'x-forwarded-for': ['203.0.113.5, 10.0.0.9'] } };
    expect(guard.canActivate(contextFor(request))).toBe(true);
  });

  it('handles IPv6 addresses and CIDR ranges', () => {
    process.env.IP_ALLOWLIST = '2001:db8::/32';
    expect(guard.canActivate(contextFor({ ip: '2001:db8:85a3::8a2e:370:7334' }))).toBe(true);
    expect(() => guard.canActivate(contextFor({ ip: '2001:db9::1' }))).toThrow(ForbiddenException);
  });

  it('normalizes IPv4-mapped IPv6 addresses', () => {
    process.env.IP_ALLOWLIST = '10.0.0.7';
    expect(guard.canActivate(contextFor({ ip: '::ffff:10.0.0.7' }))).toBe(true);
  });

  it('denies all requests when the allowlist is empty', () => {
    expect(() => guard.canActivate(contextFor({ ip: '10.0.0.1' }))).toThrow(ForbiddenException);
  });

  it('denies requests without a resolvable client IP', () => {
    process.env.IP_ALLOWLIST = '10.0.0.1';
    expect(() => guard.canActivate(contextFor({ headers: {} }))).toThrow(ForbiddenException);
  });

  it('denies malformed client IPs and malformed allowlist entries', () => {
    process.env.IP_ALLOWLIST = '10.0.0.1,999.1.1.1,10.0.0.0/99,2001:db8::/xyz';
    expect(() => guard.canActivate(contextFor({ ip: 'not-an-ip' }))).toThrow(ForbiddenException);
  });

  it('falls back to socket remoteAddress', () => {
    process.env.IP_ALLOWLIST = '10.0.0.1';
    expect(guard.canActivate(contextFor({ socket: { remoteAddress: '10.0.0.1' } }))).toBe(true);
  });

  it('rejects malformed IPv4 octets', () => {
    process.env.IP_ALLOWLIST = '10.0.0.1';
    const contexts = [
      contextFor({ ip: '10.0.0.256' }),
      contextFor({ ip: '10.0.a.1' }),
      contextFor({ ip: '::ffff:999.0.0.1' }),
    ];
    contexts.forEach((context) =>
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException),
    );
  });

  it('rejects malformed IPv6 addresses', () => {
    process.env.IP_ALLOWLIST = '2001:db8::/32';
    const addresses = ['2001::db8::1', '2001:db8::gggg', '2001:0:0:0:0:0:0:0:1', '10.0.0.1'];
    addresses.forEach((ip) =>
      expect(() => guard.canActivate(contextFor({ ip }))).toThrow(ForbiddenException),
    );
  });

  it('rejects malformed and out-of-range CIDR prefixes', () => {
    process.env.IP_ALLOWLIST = '10.0.0.0/abc, 10.0.0.0/-1, 10.0.0.0/99, 2001:db8::/200';
    expect(() => guard.canActivate(contextFor({ ip: '10.0.0.5' }))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(contextFor({ ip: '2001:db9::1' }))).toThrow(ForbiddenException);
  });

  it('parses compressed IPv6 addresses starting with a double colon', () => {
    process.env.IP_ALLOWLIST = '::1';
    expect(guard.canActivate(contextFor({ ip: '::1' }))).toBe(true);
  });

  it('rejects IPv6 addresses with malformed groups', () => {
    process.env.IP_ALLOWLIST = '2001:db8::1';
    const addresses = ['2001:db8:::1', '2001:0db8:1', '12345:db8::1', '2001:db8::12345'];
    addresses.forEach((ip) =>
      expect(() => guard.canActivate(contextFor({ ip }))).toThrow(ForbiddenException),
    );
  });

  it('matches a bracketed IPv6 address with a partial-byte prefix', () => {
    process.env.IP_ALLOWLIST = '2001:db8:abcd::/47';
    expect(guard.canActivate(contextFor({ ip: '[2001:db8:abcc::1]' }))).toBe(true);
    expect(() => guard.canActivate(contextFor({ ip: '2001:db8:ac00::1' }))).toThrow(
      ForbiddenException,
    );
  });

  it('applies the decorator-provided allowlist', () => {
    @AllowIps('172.16.0.0/12')
    class ProtectedController {}

    const context = contextFor({ ip: '172.20.1.1' }, ProtectedController);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('does not apply the decorator to unrelated controllers', () => {
    @AllowIps('172.16.0.0/12')
    class ProtectedController {}
    class PublicController {}

    expect(() => guard.canActivate(contextFor({ ip: '8.8.8.8' }, PublicController))).toThrow(
      ForbiddenException,
    );
    expect(guard.canActivate(contextFor({ ip: '172.16.5.4' }, ProtectedController))).toBe(true);
  });
});
