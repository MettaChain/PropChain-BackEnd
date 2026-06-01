import { Test, TestingModule } from '@nestjs/testing';
import { InternalServerErrorException } from '@nestjs/common';
import { SignedUrlService } from './signed-url.service';
import { SignedUrlProvider } from './signed-url-provider.interface';
import { SIGNED_URL_PROVIDER_TOKEN } from '../documents.module';

describe('SignedUrlService', () => {
  let service: SignedUrlService;
  let mockProvider: jest.Mocked<SignedUrlProvider>;

  beforeEach(async () => {
    mockProvider = {
      isConfigured: jest.fn(),
      getSignedUrl: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SignedUrlService,
        {
          provide: SIGNED_URL_PROVIDER_TOKEN,
          useValue: mockProvider,
        },
      ],
    }).compile();

    service = module.get<SignedUrlService>(SignedUrlService);
  });

  describe('isConfigured', () => {
    it('should return true when provider is configured', () => {
      mockProvider.isConfigured.mockReturnValue(true);
      expect(service.isConfigured()).toBe(true);
    });

    it('should return false when provider is not configured', () => {
      mockProvider.isConfigured.mockReturnValue(false);
      expect(service.isConfigured()).toBe(false);
    });
  });

  describe('getSignedUrl', () => {
    it('should return signed URL from provider', async () => {
      const response = {
        url: 'https://signed.url/document.pdf',
        expiresAt: new Date(),
        objectKey: 'documents/doc.pdf',
      };
      mockProvider.getSignedUrl.mockResolvedValue(response);

      const result = await service.getSignedUrl({
        operation: 'download',
        objectKey: 'documents/doc.pdf',
      });

      expect(result).toEqual(response);
    });

    it('should throw InternalServerErrorException when provider fails', async () => {
      mockProvider.getSignedUrl.mockRejectedValue(new Error('Provider error'));

      await expect(
        service.getSignedUrl({
          operation: 'download',
          objectKey: 'documents/doc.pdf',
        }),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });
});
