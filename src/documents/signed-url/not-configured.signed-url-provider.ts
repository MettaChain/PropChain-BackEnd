import { Injectable } from '@nestjs/common';
import {
  SignedUrlProvider,
  SignedUrlRequest,
  SignedUrlResponse,
} from './signed-url-provider.interface';

@Injectable()
export class NotConfiguredSignedUrlProvider implements SignedUrlProvider {
  isConfigured(): boolean {
    return false;
  }

  async getSignedUrl(_req: SignedUrlRequest): Promise<SignedUrlResponse> {
    throw new Error('Signed URL provider is not configured.');
  }
}
