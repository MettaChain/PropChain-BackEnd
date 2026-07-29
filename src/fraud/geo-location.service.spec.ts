import { GeoLocationService } from './geo-location.service';

function fakeRequest(opts: { ip?: string; xForwardedFor?: string | string[] } = {}) {
  const headers: Record<string, string | string[] | undefined> = {};
  if (opts.xForwardedFor !== undefined) {
    headers['x-forwarded-for'] = opts.xForwardedFor;
  }
  return { ip: opts.ip, headers };
}

describe('GeoLocationService', () => {
  let service: GeoLocationService;

  beforeEach(() => {
    service = new GeoLocationService();
  });

  describe('extractIp', () => {
    it('returns req.ip when no X-Forwarded-For header is present', () => {
      expect(service.extractIp(fakeRequest({ ip: '203.0.113.10' }))).toBe('203.0.113.10');
    });

    it('prefers the first hop from a comma-separated X-Forwarded-For chain', () => {
      expect(
        service.extractIp(
          fakeRequest({ ip: '127.0.0.1', xForwardedFor: '203.0.113.10, 10.0.0.1' }),
        ),
      ).toBe('203.0.113.10');
    });

    it('handles array-valued headers', () => {
      expect(
        service.extractIp(
          fakeRequest({ ip: '127.0.0.1', xForwardedFor: ['203.0.113.10, 10.0.0.1'] }),
        ),
      ).toBe('203.0.113.10');
    });

    it('returns null when nothing is supplied', () => {
      expect(service.extractIp({ headers: {} })).toBeNull();
    });
  });

  describe('lookup', () => {
    it('returns fallback for the loopback address', () => {
      const result = service.lookup('127.0.0.1');
      expect(result.countryCode).toBeNull();
      expect(result.source).toBe('fallback');
    });

    it('returns fallback for RFC-1918 ranges', () => {
      for (const ip of ['10.0.0.1', '192.168.1.1', '172.16.0.1']) {
        expect(service.lookup(ip).source).toBe('fallback');
      }
    });

    it('matches the most common hard-coded test prefixes', () => {
      expect(service.lookup('8.8.8.8')).toMatchObject({ countryCode: 'US', city: 'Mountain View' });
      expect(service.lookup('82.10.20.30')).toMatchObject({ countryCode: 'GB', city: 'London' });
      expect(service.lookup('41.1.2.3')).toMatchObject({ countryCode: 'EG', city: 'Cairo' });
      expect(service.lookup('150.20.30.40')).toMatchObject({ countryCode: 'JP', city: 'Tokyo' });
    });

    it('falls back when the prefix does not match', () => {
      const result = service.lookup('169.254.0.1');
      expect(result.countryCode).toBeNull();
      expect(result.source).toBe('fallback');
    });
  });

  describe('resolveFromRequest', () => {
    it('marks the origin as "header" when X-Forwarded-For supplied', () => {
      const result = service.resolveFromRequest(fakeRequest({ xForwardedFor: '8.8.4.4' }));
      expect(result.countryCode).toBe('US');
      expect(result.source).toBe('header');
    });

    it('marks the origin as "lookup" when only req.ip is supplied', () => {
      const result = service.resolveFromRequest(fakeRequest({ ip: '8.8.4.4' }));
      expect(result.countryCode).toBe('US');
      expect(result.source).toBe('lookup');
    });
  });
});
