import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  UploadDocumentDto,
  UpdateMetadataDto,
  DocumentQueryDto,
  DownloadQueryDto,
} from '../../src/documents/dto';
import { DocumentType, DocumentAccessLevel } from '../../src/documents/document.model';

describe('Document DTOs', () => {
  describe('UploadDocumentDto', () => {
    it('should pass with all optional fields empty', async () => {
      const dto = plainToInstance(UploadDocumentDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should pass with valid document data', async () => {
      const dto = plainToInstance(UploadDocumentDto, {
        propertyId: 'prop_abc123',
        type: DocumentType.DEED,
        title: 'Property Deed 2024',
        description: 'Official property deed document',
        tags: 'legal,deed,2024',
        accessLevel: DocumentAccessLevel.PRIVATE,
        allowedUserIds: 'user1,user2',
        allowedRoles: 'ADMIN,AGENT',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail with invalid document type', async () => {
      const dto = plainToInstance(UploadDocumentDto, {
        type: 'INVALID_TYPE',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with invalid access level', async () => {
      const dto = plainToInstance(UploadDocumentDto, {
        accessLevel: 'INVALID_LEVEL',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with title too long', async () => {
      const dto = plainToInstance(UploadDocumentDto, {
        title: 'A'.repeat(201),
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with description too long', async () => {
      const dto = plainToInstance(UploadDocumentDto, {
        description: 'A'.repeat(1001),
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should pass with all valid document types', async () => {
      const validTypes = [DocumentType.DEED, DocumentType.INSPECTION_REPORT, DocumentType.PHOTO, DocumentType.OTHER];
      for (const type of validTypes) {
        const dto = plainToInstance(UploadDocumentDto, { type });
        const errors = await validate(dto);
        expect(errors.length).toBe(0);
      }
    });

    it('should pass with all valid access levels', async () => {
      const validLevels = [DocumentAccessLevel.PRIVATE, DocumentAccessLevel.RESTRICTED, DocumentAccessLevel.PUBLIC];
      for (const accessLevel of validLevels) {
        const dto = plainToInstance(UploadDocumentDto, { accessLevel });
        const errors = await validate(dto);
        expect(errors.length).toBe(0);
      }
    });
  });

  describe('UpdateMetadataDto', () => {
    it('should pass with all optional fields empty', async () => {
      const dto = plainToInstance(UpdateMetadataDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should pass with valid metadata update', async () => {
      const dto = plainToInstance(UpdateMetadataDto, {
        title: 'Updated Title',
        description: 'Updated description',
        accessLevel: DocumentAccessLevel.PUBLIC,
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail with invalid access level', async () => {
      const dto = plainToInstance(UpdateMetadataDto, {
        accessLevel: 'INVALID',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('DocumentQueryDto', () => {
    it('should pass with valid query parameters', async () => {
      const dto = plainToInstance(DocumentQueryDto, {
        propertyId: 'prop_abc123',
        type: DocumentType.DEED,
        accessLevel: DocumentAccessLevel.PRIVATE,
        tag: 'legal',
        uploadedBy: 'user_abc123',
        createdAfter: '2024-01-01T00:00:00.000Z',
        createdBefore: '2024-12-31T23:59:59.999Z',
        search: 'deed',
        page: 1,
        limit: 20,
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should pass with empty query', async () => {
      const dto = plainToInstance(DocumentQueryDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail with invalid createdAfter date', async () => {
      const dto = plainToInstance(DocumentQueryDto, {
        createdAfter: 'invalid-date',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with invalid createdBefore date', async () => {
      const dto = plainToInstance(DocumentQueryDto, {
        createdBefore: '01/01/2024',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with invalid document type', async () => {
      const dto = plainToInstance(DocumentQueryDto, {
        type: 'INVALID',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('DownloadQueryDto', () => {
    it('should pass with valid version', async () => {
      const dto = plainToInstance(DownloadQueryDto, {
        version: 1,
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should pass with no version (optional)', async () => {
      const dto = plainToInstance(DownloadQueryDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail with version less than 1', async () => {
      const dto = plainToInstance(DownloadQueryDto, {
        version: 0,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with negative version', async () => {
      const dto = plainToInstance(DownloadQueryDto, {
        version: -1,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with non-integer version', async () => {
      const dto = plainToInstance(DownloadQueryDto, {
        version: 1.5,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
