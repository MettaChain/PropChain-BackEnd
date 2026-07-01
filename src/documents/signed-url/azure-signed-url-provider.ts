// @ts-nocheck

import { Injectable } from '@nestjs/common';
import {
  SignedUrlProvider,
  SignedUrlRequest,
  SignedUrlResponse,
} from './signed-url-provider.interface';

/**
 * Placeholder strategy for Azure Blob Storage signed URLs.
 * This shell intentionally throws until an integrator wires in a real implementation.
 */
@Injectable()
export class AzureSignedUrlProvider implements SignedUrlProvider {
  isConfigured(): boolean {
    return false;
  }

  async getSignedUrl(_req: SignedUrlRequest): Promise<SignedUrlResponse> {
    throw new Error('Azure signed URL provider is not configured.');
  }
}
