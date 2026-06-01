export type SignedUrlOperation = 'upload' | 'download';

export type SignedUrlRequest = {
  operation: SignedUrlOperation;
  objectKey: string;
  contentType?: string;
  contentLengthBytes?: number;
  expiresInSeconds?: number;
};

export type SignedUrlResponse = {
  url: string;
  expiresAt: Date;
  objectKey: string;
};

export interface SignedUrlProvider {
  isConfigured(): boolean;
  getSignedUrl(req: SignedUrlRequest): Promise<SignedUrlResponse>;
}
