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
        fileSizeBytes: 30 * 1024 * 1024,
      };
      expect(() => service.validate(req)).toThrow(BadRequestException);
      expect(() => service.validate(req)).toThrow('File exceeds maximum allowed size of 25 MB for application/pdf');
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

    it('should throw BadRequestException for zero size file', () => {
      const req: UploadRequest = {
        fileName: 'empty.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: 0,
      };
      expect(() => service.validate(req)).toThrow(BadRequestException);
      expect(() => service.validate(req)).toThrow('File size must be greater than zero');
    });

    it('should enforce type-specific size limits for images', () => {
      const req: UploadRequest = {
        fileName: 'big.png',
        mimeType: 'image/png',
        fileSizeBytes: 15 * 1024 * 1024,
      };
      expect(() => service.validate(req)).toThrow(BadRequestException);
    });

    it('should enforce type-specific size limits for docs', () => {
      const req: UploadRequest = {
        fileName: 'big.doc',
        mimeType: 'application/msword',
        fileSizeBytes: 20 * 1024 * 1024,
      };
      expect(() => service.validate(req)).toThrow(BadRequestException);
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

  describe('validateMagicBytes', () => {
    it('should validate PDF magic bytes', () => {
      const pdfBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
      expect(service.validateMagicBytes(pdfBuffer, 'application/pdf')).toBe(true);
    });

    it('should reject wrong magic bytes', () => {
      const buf = Buffer.from([0x00, 0x00, 0x00, 0x00]);
      expect(service.validateMagicBytes(buf, 'application/pdf')).toBe(false);
    });

    it('should validate JPEG magic bytes', () => {
      const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
      expect(service.validateMagicBytes(jpegBuffer, 'image/jpeg')).toBe(true);
    });

    it('should validate PNG magic bytes', () => {
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      expect(service.validateMagicBytes(pngBuffer, 'image/png')).toBe(true);
    });

    it('should validate WebP magic bytes', () => {
      const webpBuffer = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00]);
      expect(service.validateMagicBytes(webpBuffer, 'image/webp')).toBe(true);
    });

    it('should return true for unknown MIME types', () => {
      const buf = Buffer.from([0x00, 0x00]);
      expect(service.validateMagicBytes(buf, 'application/octet-stream')).toBe(true);
    });

    it('should handle buffer shorter than signature', () => {
      const shortBuf = Buffer.from([0x25]);
      expect(service.validateMagicBytes(shortBuf, 'application/pdf')).toBe(false);
    });
  });

  describe('sanitizeFilename', () => {
    it('should remove path traversal sequences', () => {
      expect(service.sanitizeFilename('../../../etc/passwd')).not.toContain('..');
    });

    it('should remove null bytes', () => {
      expect(service.sanitizeFilename('file\x00name.pdf')).not.toContain('\x00');
    });

    it('should remove slashes', () => {
      expect(service.sanitizeFilename('path/to/file.pdf')).not.toContain('/');
    });

    it('should replace special characters with underscores', () => {
      const result = service.sanitizeFilename('hello world!@#.pdf');
      expect(result).not.toContain(' ');
      expect(result).not.toContain('!');
    });

    it('should handle empty input with fallback', () => {
      const result = service.sanitizeFilename('...');
      expect(result).toMatch(/^upload_\d+$/);
    });

    it('should lowercase output', () => {
      expect(service.sanitizeFilename('FILE.PDF')).toBe('file.pdf');
    });
  });

  describe('validateFileSize', () => {
    it('should pass for files within limits', () => {
      const buf = Buffer.alloc(1024);
      expect(() => service.validateFileSize(buf, 'application/pdf')).not.toThrow();
    });

    it('should throw for oversized files', () => {
      const buf = Buffer.alloc(30 * 1024 * 1024);
      expect(() => service.validateFileSize(buf, 'application/pdf')).toThrow(BadRequestException);
    });
  });

  describe('scanForThreats', () => {
    it('should detect script tags', () => {
      const buf = Buffer.from('<script>alert("xss")</script>');
      const result = service.scanForThreats(buf);
      expect(result.safe).toBe(false);
    });

    it('should detect javascript protocol', () => {
      const buf = Buffer.from('javascript:void(0)');
      const result = service.scanForThreats(buf);
      expect(result.safe).toBe(false);
    });

    it('should detect iframe tags', () => {
      const buf = Buffer.from('<iframe src="evil.com">');
      const result = service.scanForThreats(buf);
      expect(result.safe).toBe(false);
    });

    it('should detect object tags', () => {
      const buf = Buffer.from('<object data="evil.swf">');
      const result = service.scanForThreats(buf);
      expect(result.safe).toBe(false);
    });

    it('should return safe for clean content', () => {
      const buf = Buffer.from('Hello world, this is a normal document.');
      const result = service.scanForThreats(buf);
      expect(result.safe).toBe(true);
    });

    it('should handle binary content without false positives', () => {
      const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const result = service.scanForThreats(buf);
      expect(result.safe).toBe(true);
    });
  });
});
