import { Test, TestingModule } from '@nestjs/testing';
import { DocumentVersionService } from './document-version.service';

describe('DocumentVersionService', () => {
  let service: DocumentVersionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DocumentVersionService],
    }).compile();
    service = module.get<DocumentVersionService>(DocumentVersionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('addVersion', () => {
    it('should add the first version', () => {
      const version = service.addVersion('doc-1', 'http://url', 'user-1', 'Initial');
      expect(version.versionNumber).toBe(1);
      expect(version.fileUrl).toBe('http://url');
      expect(version.updatedBy).toBe('user-1');
      expect(version.changeNote).toBe('Initial');
      expect(version).toHaveProperty('updatedAt');
    });

    it('should increment version numbers', () => {
      service.addVersion('doc-2', 'http://url1', 'user-1');
      const v2 = service.addVersion('doc-2', 'http://url2', 'user-1');
      expect(v2.versionNumber).toBe(2);
    });
  });

  describe('getVersions', () => {
    it('should return empty array for unknown document', () => {
      expect(service.getVersions('unknown')).toEqual([]);
    });

    it('should return array of versions', () => {
      service.addVersion('doc-3', 'url', 'user');
      const versions = service.getVersions('doc-3');
      expect(versions.length).toBe(1);
    });
  });

  describe('getLatest', () => {
    it('should return null for unknown document', () => {
      expect(service.getLatest('unknown')).toBeNull();
    });

    it('should return the latest version', () => {
      service.addVersion('doc-4', 'url1', 'user');
      const v2 = service.addVersion('doc-4', 'url2', 'user');
      const latest = service.getLatest('doc-4');
      expect(latest).toEqual(v2);
    });
  });
});
