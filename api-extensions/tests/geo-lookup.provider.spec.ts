import { ConfigurableGeoLookupProvider } from '../modules/geographic-ip/geo-lookup.provider';

describe('ConfigurableGeoLookupProvider', () => {
  const originalRanges = process.env.GEO_IP_RANGES;
  const originalApiUrl = process.env.GEO_LOOKUP_API_URL;

  beforeEach(() => {
    delete process.env.GEO_IP_RANGES;
    delete process.env.GEO_LOOKUP_API_URL;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalRanges === undefined) {
      delete process.env.GEO_IP_RANGES;
    } else {
      process.env.GEO_IP_RANGES = originalRanges;
    }
    if (originalApiUrl === undefined) {
      delete process.env.GEO_LOOKUP_API_URL;
    } else {
      process.env.GEO_LOOKUP_API_URL = originalApiUrl;
    }
  });

  it('does not map whole first-octet ranges to a country', async () => {
    const provider = new ConfigurableGeoLookupProvider();

    await expect(provider.lookup('82.1.2.3')).resolves.toBeNull();
    await expect(provider.lookup('199.1.2.3')).resolves.toBeNull();
    await expect(provider.lookup('5.1.2.3')).resolves.toBeNull();
  });

  it('marks offline prefix results as approximate', async () => {
    const provider = new ConfigurableGeoLookupProvider();

    await expect(provider.lookup('8.8.8.8')).resolves.toEqual({
      country: 'US',
      region: 'California',
      city: 'Mountain View',
      latitude: 37.4056,
      longitude: -122.0775,
      accuracy: 'approximate',
    });
  });

  it('marks explicitly configured offline ranges as approximate', async () => {
    const provider = new ConfigurableGeoLookupProvider([
      {
        prefix: '82.',
        country: 'GB',
        region: 'England',
        city: 'London',
        latitude: 51.5074,
        longitude: -0.1278,
      },
    ]);

    await expect(provider.lookup('82.1.2.3')).resolves.toMatchObject({
      country: 'GB',
      accuracy: 'approximate',
    });
  });

  it('treats a configured lookup API as authoritative', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ country_code: 'DE', city: 'Berlin', lat: 52.52, lon: 13.405 }),
    } as unknown as Response);
    const provider = new ConfigurableGeoLookupProvider(undefined, 'https://geo.example/lookup');

    await expect(provider.lookup('203.0.113.9')).resolves.toMatchObject({
      country: 'DE',
      accuracy: 'exact',
    });
  });
});
