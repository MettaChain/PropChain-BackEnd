import { VersionRoutingService } from './version-routing.service';
import { ApiVersionEnum } from './api-version.constants';

describe('VersionRoutingService', () => {
  let service: VersionRoutingService;

  beforeEach(() => {
    service = new VersionRoutingService();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('versionedResponse', () => {
    it('should wrap data with version metadata', () => {
      const data = { id: 1, name: 'Test' };
      const version = ApiVersionEnum.V2;

      const result = service.versionedResponse(data, version);

      expect(result.apiVersion).toBe(version);
      expect(result.data).toEqual(data);
      expect(result.timestamp).toBeDefined();
      expect(typeof result.timestamp).toBe('string');
      expect(new Date(result.timestamp).toString()).not.toBe('Invalid Date');
    });
  });

  describe('transformDataByVersion', () => {
    it('should return the same data if fromVersion equals toVersion', () => {
      const data = { id: 1, name: 'Test' };

      const result = service.transformDataByVersion(data, ApiVersionEnum.V2, ApiVersionEnum.V2);

      expect(result).toBe(data);
    });

    it('should return data even when transforming between versions', () => {
      const v1Data = { id: 1, name: 'Test' };
      const result1 = service.transformDataByVersion(v1Data, ApiVersionEnum.V1, ApiVersionEnum.V2);
      expect(result1).toEqual(v1Data);

      const v2Data = { id: 1, name: 'Test', createdAt: '2026-01-01' };
      const result2 = service.transformDataByVersion(v2Data, ApiVersionEnum.V2, ApiVersionEnum.V1);
      expect(result2).toEqual(v2Data);
    });
  });

  describe('getCompatibleVersions', () => {
    it('should return correct compatible versions for V1', () => {
      const compatibleVersions = service.getCompatibleVersions(ApiVersionEnum.V1);

      expect(compatibleVersions).toEqual([ApiVersionEnum.V1]);
      expect(compatibleVersions).toHaveLength(1);
    });

    it('should return correct compatible versions for V2', () => {
      const compatibleVersions = service.getCompatibleVersions(ApiVersionEnum.V2);

      expect(compatibleVersions).toContain(ApiVersionEnum.V2);
      expect(compatibleVersions).toContain(ApiVersionEnum.V1);
      expect(compatibleVersions).toHaveLength(2);
    });

    it('should return an array with at least the version itself for unknown versions', () => {
      // @ts-ignore - testing with invalid version
      const compatibleVersions = service.getCompatibleVersions('v3' as ApiVersionEnum);

      expect(compatibleVersions).toEqual(['v3']);
      expect(compatibleVersions).toContain('v3');
    });
  });
});
