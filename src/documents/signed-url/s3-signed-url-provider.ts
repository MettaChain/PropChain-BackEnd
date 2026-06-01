import { Injectable } from '@nestjs/common';
import {
  SignedUrlProvider,
  SignedUrlRequest,
  SignedUrlResponse,
} from './signed-url-provider.interface';

/**
 * Placeholder for AWS S3 signed URLs.
 * Intentionally throws if required env vars are missing.
 */
@Injectable()
export class S3SignedUrlProvider implements SignedUrlProvider {
  isConfigured(): boolean {
    return Boolean(
      process.env.AWS_S3_BUCKET &&
      process.env.AWS_ACCESS_KEY_ID &&
      process.env.AWS_SECRET_ACCESS_KEY,
    );
  }

  async getSignedUrl(_req: SignedUrlRequest): Promise<SignedUrlResponse> {
    if (!this.isConfigured()) {
      throw new Error('S3SignedUrlProvider not configured');
    }

    // Placeholder: implement via AWS SDK v3 once you wire credentials.
    throw new Error('S3 signed URL not implemented yet');
  }
}
