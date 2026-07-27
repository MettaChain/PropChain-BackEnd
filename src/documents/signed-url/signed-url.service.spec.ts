import { Test, TestingModule } from '@nestjs/testing';
import { SignedUrlService } from './signed-url.service';

describe('SignedUrlService', () => {
  let service: SignedUrlService;

  // Create a mock provider that mimics the SignedUrlProvider interface
  const mockProvider = {
    getSignedUrl: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SignedUrlService,
        // We MUST provide the exact token the service is injecting
        {
          provide: 'SIGNED_URL_PROVIDER_TOKEN',
          useValue: mockProvider,
        },
      ],
    }).compile();

    service = module.get<SignedUrlService>(SignedUrlService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getSignedUrl', () => {
    it('should delegate to the injected provider', async () => {
      const payload = { operation: 'download' as any, objectKey: 'test.pdf' };
      mockProvider.getSignedUrl.mockResolvedValue({ url: 'http://signed' } as any);

      const result = await service.getSignedUrl(payload);

      expect(mockProvider.getSignedUrl).toHaveBeenCalledWith(payload);
      expect(result).toEqual({ url: 'http://signed' });
    });
  });
});
