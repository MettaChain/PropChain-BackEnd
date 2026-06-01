import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import { SignedUrlResponse } from './signed-url-provider.interface';
import { SIGNED_URL_PROVIDER_TOKEN } from '../documents.module';
import { SignedUrlProvider, SignedUrlRequest } from './signed-url-provider.interface';

@Injectable()
export class SignedUrlService {
  constructor(
    @Inject(SIGNED_URL_PROVIDER_TOKEN)
    private readonly provider: SignedUrlProvider,
  ) {}

  isConfigured(): boolean {
    return this.provider.isConfigured();
  }

  async getSignedUrl(req: SignedUrlRequest): Promise<SignedUrlResponse> {
    try {
      return await this.provider.getSignedUrl(req);
    } catch (e: any) {
      throw new InternalServerErrorException(e?.message ?? 'Failed to get signed URL');
    }
  }
}
