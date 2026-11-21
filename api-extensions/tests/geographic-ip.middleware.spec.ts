import { NextFunction, Request, Response } from 'express';
import {
  GEO_CACHE,
  GEOGRAPHIC_IP_OPTIONS,
  GEO_LOOKUP_PROVIDER,
  GeoCache,
  GeoLocationData,
  GeoLookupProvider,
} from '../modules/geographic-ip/geographic-ip.types';
import {
  GeographicIpMiddleware,
  extractClientIp,
  isPrivateIpAddress,
} from '../modules/geographic-ip/geographic-ip.middleware';

interface GeoRequest extends Request {
  geo?: GeoLocationData;
}

function requestWith(overrides: Record<string, unknown> = {}): GeoRequest {
  return {
    headers: {},
    ip: '8.8.8.8',
    method: 'GET',
    ...overrides,
  } as unknown as GeoRequest;
}

function responseStub(): Response {
  return {
    setHeader: jest.fn(),
  } as unknown as Response;
}

describe('GeographicIpMiddleware (#1610)', () => {
  let provider: { lookup: jest.Mock };
  let cache: { get: jest.Mock; set: jest.Mock };
  let middleware: GeographicIpMiddleware;
  let next: jest.Mock;

  const location = {
    country: 'US',
    region: 'California',
    city: 'Mountain View',
    latitude: 37.4056,
    longitude: -122.0775,
  };

  beforeEach(() => {
    provider = { lookup: jest.fn().mockResolvedValue(location) };
    cache = { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue('OK') };
    middleware = new GeographicIpMiddleware(
      provider as unknown as GeoLookupProvider,
      cache as unknown as GeoCache,
      { cacheTtlSeconds: 86_400, cachePrefix: 'geo:ip:' },
    );
    next = jest.fn();
  });

  it('is injectable with the documented tokens', () => {
    expect(GEO_LOOKUP_PROVIDER).toBeDefined();
    expect(GEO_CACHE).toBeDefined();
    expect(GEOGRAPHIC_IP_OPTIONS).toBeDefined();
  });

  it('resolves and attaches geo data on a cache miss', async () => {
    const req = requestWith();

    await middleware.use(req, responseStub(), next as unknown as NextFunction);

    expect(provider.lookup).toHaveBeenCalledWith('8.8.8.8');
    expect(req.geo).toEqual({
      ipAddress: '8.8.8.8',
      ...location,
      lat: location.latitude,
      lng: location.longitude,
      isPrivate: false,
      source: 'lookup',
    });
    expect(cache.set).toHaveBeenCalledWith('geo:ip:8.8.8.8', JSON.stringify(location), 86_400);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('serves a cached lookup without calling the provider', async () => {
    cache.get.mockResolvedValue(JSON.stringify(location));
    const req = requestWith();

    await middleware.use(req, responseStub(), next as unknown as NextFunction);

    expect(provider.lookup).not.toHaveBeenCalled();
    expect(req.geo).toMatchObject({ city: 'Mountain View', source: 'cache' });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('short-circuits private and loopback addresses', async () => {
    const req = requestWith({ ip: '127.0.0.1', headers: { 'x-forwarded-for': '10.0.0.5' } });

    await middleware.use(req, responseStub(), next as unknown as NextFunction);

    expect(req.geo).toMatchObject({
      ipAddress: '10.0.0.5',
      isPrivate: true,
      source: 'fallback',
      country: null,
    });
    expect(provider.lookup).not.toHaveBeenCalled();
    expect(cache.get).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('handles requests without an IP address', async () => {
    const req = requestWith({ ip: undefined, headers: {} });

    await middleware.use(req, responseStub(), next as unknown as NextFunction);

    expect(req.geo).toMatchObject({ ipAddress: 'unknown', isPrivate: true });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('degrades gracefully when the provider and cache fail', async () => {
    provider.lookup.mockRejectedValue(new Error('provider down'));
    cache.get.mockRejectedValue(new Error('redis down'));
    const req = requestWith();

    await middleware.use(req, responseStub(), next as unknown as NextFunction);

    expect(req.geo).toMatchObject({
      ipAddress: '8.8.8.8',
      isPrivate: false,
      source: 'fallback',
      country: null,
    });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('ignores malformed cached entries', async () => {
    cache.get.mockResolvedValue('"not-an-object"');
    const req = requestWith();

    await middleware.use(req, responseStub(), next as unknown as NextFunction);

    expect(provider.lookup).toHaveBeenCalled();
    expect(req.geo?.source).toBe('lookup');
  });

  it('works without an injected cache', async () => {
    middleware = new GeographicIpMiddleware(provider as unknown as GeoLookupProvider);
    const req = requestWith();

    await middleware.use(req, responseStub(), next as unknown as NextFunction);

    expect(provider.lookup).toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe('client IP helpers', () => {
  it('prefers the left-most X-Forwarded-For entry', () => {
    expect(
      extractClientIp({
        headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' },
        ip: '10.0.0.2',
      }),
    ).toBe('203.0.113.9');
  });

  it('unwraps IPv4-mapped IPv6 addresses', () => {
    expect(extractClientIp({ headers: {}, ip: '::ffff:8.8.8.8' })).toBe('8.8.8.8');
  });

  it('returns null when no candidate is a valid IP', () => {
    expect(extractClientIp({ headers: {}, ip: 'not-an-ip' })).toBeNull();
  });

  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '192.168.1.1',
    '172.16.0.1',
    '172.31.255.255',
    '169.254.1.1',
    '100.64.0.1',
    '::1',
    'fd00::1',
    'fe80::1',
  ])('treats %s as private', (ip) => {
    expect(isPrivateIpAddress(ip)).toBe(true);
  });

  it.each(['8.8.8.8', '203.0.113.9', '172.32.0.1', '2001:4860:4860::8888'])(
    'treats %s as public',
    (ip) => {
      expect(isPrivateIpAddress(ip)).toBe(false);
    },
  );
});
