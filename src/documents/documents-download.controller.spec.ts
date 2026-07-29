import { Test, TestingModule } from '@nestjs/testing';
import { DocumentsDownloadController } from './documents-download.controller';
import { DocumentsService } from './documents.service';
import { SignedUrlService } from './signed-url/signed-url.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuthUserPayload } from '../auth/types/auth-user.type';
import { UserRole, UserTier } from '../types/prisma.types';
import { Response } from 'express';

describe('DocumentsDownloadController', () => {
  let controller: DocumentsDownloadController;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let documentsService: DocumentsService;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let signedUrlService: SignedUrlService;

  const mockDocumentsService = {
    findAuthorizedById: jest.fn(),
    getVersion: jest.fn(),
    toObjectKey: jest.fn(),
    buildUploadObjectKey: jest.fn(),
    create: jest.fn(),
  };

  const mockSignedUrlService = {
    getSignedUrl: jest.fn(),
  };

  const mockUser: AuthUserPayload = {
    sub: 'user-1',
    role: UserRole.USER,
    tier: UserTier.FREE,
    email: 'test@test.com',
    type: 'access',
  };

  const mockResponse = {
    redirect: jest.fn(),
  } as unknown as Response;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DocumentsDownloadController],
      providers: [
        { provide: DocumentsService, useValue: mockDocumentsService },
        { provide: SignedUrlService, useValue: mockSignedUrlService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<DocumentsDownloadController>(DocumentsDownloadController);
    documentsService = module.get<DocumentsService>(DocumentsService);
    signedUrlService = module.get<SignedUrlService>(SignedUrlService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('download', () => {
    it('should fetch the latest document and redirect to signed URL when no versionId is provided', async () => {
      const mockDoc = { fileUrl: 'http://example.com/doc.pdf', mimeType: 'application/pdf' };
      mockDocumentsService.findAuthorizedById.mockResolvedValue(mockDoc);
      mockDocumentsService.toObjectKey.mockReturnValue('doc.pdf');
      mockSignedUrlService.getSignedUrl.mockResolvedValue({ url: 'http://signed.url/doc' });

      await controller.download('doc-1', {}, mockUser, mockResponse);

      expect(mockDocumentsService.findAuthorizedById).toHaveBeenCalledWith(
        'doc-1',
        mockUser.sub,
        mockUser.role,
      );
      expect(mockDocumentsService.getVersion).not.toHaveBeenCalled();
      expect(mockDocumentsService.toObjectKey).toHaveBeenCalledWith('http://example.com/doc.pdf');
      expect(mockSignedUrlService.getSignedUrl).toHaveBeenCalledWith({
        operation: 'download',
        objectKey: 'doc.pdf',
        contentType: 'application/pdf',
        expiresInSeconds: 60,
      });
      expect(mockResponse.redirect).toHaveBeenCalledWith('http://signed.url/doc');
    });

    it('should fetch a specific document version and redirect to signed URL when versionId is provided', async () => {
      const mockDoc = { fileUrl: 'http://example.com/doc.pdf', mimeType: 'application/pdf' };
      const mockVersion = { fileUrl: 'http://example.com/doc_v2.pdf' };

      mockDocumentsService.findAuthorizedById.mockResolvedValue(mockDoc);
      mockDocumentsService.getVersion.mockResolvedValue(mockVersion);
      mockDocumentsService.toObjectKey.mockReturnValue('doc_v2.pdf');
      mockSignedUrlService.getSignedUrl.mockResolvedValue({ url: 'http://signed.url/doc_v2' });

      await controller.download('doc-1', { versionId: 'v2' }, mockUser, mockResponse);

      expect(mockDocumentsService.findAuthorizedById).toHaveBeenCalledWith(
        'doc-1',
        mockUser.sub,
        mockUser.role,
      );
      expect(mockDocumentsService.getVersion).toHaveBeenCalledWith(
        'doc-1',
        'v2',
        mockUser.sub,
        mockUser.role,
      );
      expect(mockDocumentsService.toObjectKey).toHaveBeenCalledWith(
        'http://example.com/doc_v2.pdf',
      );
      expect(mockSignedUrlService.getSignedUrl).toHaveBeenCalledWith({
        operation: 'download',
        objectKey: 'doc_v2.pdf',
        contentType: 'application/pdf',
        expiresInSeconds: 60,
      });
      expect(mockResponse.redirect).toHaveBeenCalledWith('http://signed.url/doc_v2');
    });
  });

  describe('Upload URL Endpoints', () => {
    const uploadDto = {
      fileName: 'test.pdf',
      mimeType: 'application/pdf',
      fileSizeBytes: 1024,
    } as any;

    const mockSignedUrlResponse = {
      url: 'http://signed.url/upload',
      objectKey: 'uploads/user-1/test.pdf',
      expiresAt: new Date(),
    };

    beforeEach(() => {
      mockDocumentsService.buildUploadObjectKey.mockResolvedValue('uploads/user-1/test.pdf');
      mockSignedUrlService.getSignedUrl.mockResolvedValue(mockSignedUrlResponse);
    });

    it('requestSignedUploadUrl should return a signed URL payload', async () => {
      const result = await controller.requestSignedUploadUrl(uploadDto, mockUser);

      expect(mockDocumentsService.buildUploadObjectKey).toHaveBeenCalledWith({
        ...uploadDto,
        userId: mockUser.sub,
      });
      expect(mockSignedUrlService.getSignedUrl).toHaveBeenCalledWith({
        operation: 'upload',
        objectKey: 'uploads/user-1/test.pdf',
        contentType: 'application/pdf',
        contentLengthBytes: 1024,
        expiresInSeconds: 600,
      });
      expect(result).toEqual({
        url: mockSignedUrlResponse.url,
        objectKey: mockSignedUrlResponse.objectKey,
        expiresAt: mockSignedUrlResponse.expiresAt,
      });
    });

    it('requestUploadUrl should return a signed URL payload (#750)', async () => {
      const result = await controller.requestUploadUrl(uploadDto, mockUser);

      expect(mockDocumentsService.buildUploadObjectKey).toHaveBeenCalledWith({
        ...uploadDto,
        userId: mockUser.sub,
      });
      expect(mockSignedUrlService.getSignedUrl).toHaveBeenCalledWith({
        operation: 'upload',
        objectKey: 'uploads/user-1/test.pdf',
        contentType: 'application/pdf',
        contentLengthBytes: 1024,
        expiresInSeconds: 600,
      });
      expect(result).toEqual({
        url: mockSignedUrlResponse.url,
        objectKey: mockSignedUrlResponse.objectKey,
        expiresAt: mockSignedUrlResponse.expiresAt,
      });
    });
  });

  describe('createMetadata', () => {
    it('should pass the DTO and user ID to the documents service', async () => {
      const mockDto = { fileName: 'test.pdf' };
      mockDocumentsService.create.mockResolvedValue({ id: 'doc-123' });

      const result = await controller.createMetadata(mockDto, mockUser);

      expect(mockDocumentsService.create).toHaveBeenCalledWith(mockDto, mockUser.sub);
      expect(result).toEqual({ id: 'doc-123' });
    });
  });
});
