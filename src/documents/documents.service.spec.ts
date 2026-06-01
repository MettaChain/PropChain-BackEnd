import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PassThrough } from 'stream';
import { DocumentsService } from './documents.service';
import { PrismaService } from '../database/prisma.service';

describe('DocumentsService', () => {
  let service: DocumentsService;
  let prismaService: PrismaService;

  const mockPrismaService = {
    document: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<DocumentsService>(DocumentsService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── #568 Secure Download: findAuthorizedById ─────────────────────────────

  describe('findAuthorizedById', () => {
    it('should return document when user owns it', async () => {
      const doc = { id: 'doc-1', userId: 'user-1', fileName: 'test.pdf' };
      mockPrismaService.document.findUnique.mockResolvedValue(doc);

      const result = await service.findAuthorizedById('doc-1', 'user-1');
      expect(result).toEqual(doc);
    });

    it('should throw ForbiddenException when user does not own document', async () => {
      const doc = { id: 'doc-1', userId: 'user-2', fileName: 'test.pdf' };
      mockPrismaService.document.findUnique.mockResolvedValue(doc);

      await expect(
        service.findAuthorizedById('doc-1', 'user-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when document does not exist', async () => {
      mockPrismaService.document.findUnique.mockResolvedValue(null);

      await expect(
        service.findAuthorizedById('doc-999', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── #568 Secure Download: toObjectKey ────────────────────────────────────

  describe('toObjectKey', () => {
    it('should extract path from full S3 URL', () => {
      const key = service.toObjectKey('https://bucket.s3.amazonaws.com/path/to/file.pdf');
      expect(key).toBe('path/to/file.pdf');
    });

    it('should extract path from URL with trailing slash', () => {
      const key = service.toObjectKey('https://cdn.example.com/uploads/document.pdf');
      expect(key).toBe('uploads/document.pdf');
    });

    it('should handle local file paths', () => {
      const key = service.toObjectKey('/local/path/file.pdf');
      expect(key).toBe('local/path/file.pdf');
    });

    it('should handle simple filenames', () => {
      const key = service.toObjectKey('file.pdf');
      expect(key).toBe('file.pdf');
    });
  });

  // ── #568 Secure Download: buildUploadObjectKey ───────────────────────────

  describe('buildUploadObjectKey', () => {
    it('should build a key with category prefix', async () => {
      const key = await service.buildUploadObjectKey({
        userId: 'user-1',
        fileName: 'document.pdf',
        mimeType: 'application/pdf',
        category: 'contracts',
      });

      expect(key).toMatch(/^contracts\/user-1\/\d+-[a-f0-9]{8}-document\.pdf$/);
    });

    it('should default to documents category', async () => {
      const key = await service.buildUploadObjectKey({
        userId: 'user-1',
        fileName: 'photo.jpg',
        mimeType: 'image/jpeg',
      });

      expect(key).toMatch(/^documents\/user-1\/\d+-[a-f0-9]{8}-photo\.jpg$/);
    });

    it('should sanitize filename', async () => {
      const key = await service.buildUploadObjectKey({
        userId: 'user-1',
        fileName: 'My Document (1).pdf',
        mimeType: 'application/pdf',
      });

      expect(key).toMatch(/^documents\/user-1\/\d+-[a-f0-9]{8}-my_document__1_\.pdf$/);
    });
  });

  // ── #569 Bulk Download with authorization ────────────────────────────────

  describe('bulkDownload', () => {
    /** Create a mock writable stream that acts like an Express Response */
    function mockStreamRes() {
      const stream = new PassThrough();
      (stream as any).setHeader = jest.fn();
      (stream as any).setHeaders = jest.fn();
      // Suppress the 'data' events to avoid jest hanging
      jest.spyOn(stream, 'pipe').mockImplementation(function (this: any, dest: any) {
        dest.end('fake-zip-data');
        return dest;
      });
      return stream as any;
    }

    it('should throw NotFoundException when no documents found', async () => {
      mockPrismaService.document.findMany.mockResolvedValue([]);

      await expect(
        service.bulkDownload({ documentIds: ['nonexistent'] }, mockStreamRes(), 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user does not own one of the documents', async () => {
      const docs = [
        { id: 'doc-1', userId: 'user-1', fileName: 'a.pdf', documentType: 'CONTRACT', fileUrl: 'http://example.com/a.pdf', fileSize: 100, mimeType: 'application/pdf' },
        { id: 'doc-2', userId: 'user-2', fileName: 'b.pdf', documentType: 'CONTRACT', fileUrl: 'http://example.com/b.pdf', fileSize: 200, mimeType: 'application/pdf' },
      ];
      mockPrismaService.document.findMany.mockResolvedValue(docs);

      await expect(
        service.bulkDownload({ documentIds: ['doc-1', 'doc-2'] }, mockStreamRes(), 'user-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should proceed without authorization check when userId is not provided', async () => {
      const docs = [
        { id: 'doc-1', userId: 'user-1', fileName: 'a.pdf', documentType: 'CONTRACT', fileUrl: 'http://example.com/a.pdf', fileSize: 100, mimeType: 'application/pdf' },
      ];
      mockPrismaService.document.findMany.mockResolvedValue(docs);

      const result = await service.bulkDownload({ documentIds: ['doc-1'] }, mockStreamRes());
      expect(result.count).toBe(1);
    });

    it('should authorize user when userId is provided and matches', async () => {
      const docs = [
        { id: 'doc-1', userId: 'user-1', fileName: 'a.pdf', documentType: 'CONTRACT', fileUrl: 'http://example.com/a.pdf', fileSize: 100, mimeType: 'application/pdf' },
      ];
      mockPrismaService.document.findMany.mockResolvedValue(docs);

      const result = await service.bulkDownload({ documentIds: ['doc-1'] }, mockStreamRes(), 'user-1');
      expect(result.count).toBe(1);
    });
  });
});
