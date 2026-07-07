import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { DocumentUploadService, UploadRequest } from './document-upload.service';

describe('DocumentUploadService', () => {
  let service: DocumentUploadService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DocumentUploadService],
    }).compile();
    service = module.get<DocumentUploadService>(DocumentUploadService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validate', () => {
    it('should pass for valid request', () => {
      const req: UploadRequest = {
        fileName: 'test.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: 1024,
      };
      expect(() => service.validate(req)).not.toThrow();
    });

    it('should throw BadRequestException for unsupported mime type', () => {
      const req: UploadRequest = {
        fileName: 'test.txt',
        mimeType: 'text/plain',
        fileSizeBytes: 1024,
      };
      expect(() => service.validate(req)).toThrow(BadRequestException);
      expect(() => service.validate(req)).toThrow('Unsupported file type: text/plain');
    });

    it('should throw BadRequestException for file exceeding size limit', () => {
      const req: UploadRequest = {
        fileName: 'large.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: 11 * 1024 * 1024,
      };
      expect(() => service.validate(req)).toThrow(BadRequestException);
      expect(() => service.validate(req)).toThrow('File exceeds maximum allowed size');
    });

    it('should throw BadRequestException for empty file name', () => {
      const req: UploadRequest = {
        fileName: '   ',
        mimeType: 'application/pdf',
        fileSizeBytes: 1024,
      };
      expect(() => service.validate(req)).toThrow(BadRequestException);
      expect(() => service.validate(req)).toThrow('File name cannot be empty');
    });
  });

  describe('prepareMetadata', () => {
    it('should sanitize filename and add uploadedAt', () => {
      const req: UploadRequest = {
        fileName: 'My File Report!.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: 1024,
      };
      const result = service.prepareMetadata(req);
      expect(result.fileName).toBe('My File Report!.pdf');
      expect(result.mimeType).toBe('application/pdf');
      expect(result.fileSizeBytes).toBe(1024);
      expect(result.sanitisedName).toBe('my_file_report_.pdf');
      expect(result).toHaveProperty('uploadedAt');
    });
  });
});
