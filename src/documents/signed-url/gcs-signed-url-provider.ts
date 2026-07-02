// @ts-nocheck

import { Injectable } from '@nestjs/common';
import {
  SignedUrlProvider,
  SignedUrlRequest,
  SignedUrlResponse,
} from './signed-url-provider.interface';

/**
 * Placeholder strategy for Google Cloud Storage signed URLs.
 * This shell intentionally throws until an integrator wires in a real implementation.
 */
@Injectable()
export class GcsSignedUrlProvider implements SignedUrlProvider {
  isConfigured(): boolean {
    return false;
  }

  async getSignedUrl(_req: SignedUrlRequest): Promise<SignedUrlResponse> {
    throw new Error('GCS signed URL provider is not configured.');
  }
}
