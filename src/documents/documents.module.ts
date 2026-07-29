// @ts-nocheck

import { Module, Type } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';
import { DocumentUploadService } from './document-upload.service';
import { PrismaModule } from '../database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { SignedUrlService } from './signed-url/signed-url.service';
import { NotConfiguredSignedUrlProvider } from './signed-url/not-configured.signed-url-provider';
import { S3SignedUrlProvider } from './signed-url/s3-signed-url-provider';
import { GcsSignedUrlProvider } from './signed-url/gcs-signed-url-provider';
import { AzureSignedUrlProvider } from './signed-url/azure-signed-url-provider';
import { DocumentsDownloadController } from './documents-download.controller';
import { SignedUrlProvider } from './signed-url/signed-url-provider.interface';

export const SIGNED_URL_PROVIDER_TOKEN = 'SIGNED_URL_PROVIDER_TOKEN';

/**
 * Factory that selects the SignedUrlProvider implementation based on the
 * SIGNED_URL_PROVIDER environment variable.
 *
 * Supported values:
 *   - 's3'          -> S3SignedUrlProvider (no-op shell for integrators)
 *   - 'gcs'         -> GcsSignedUrlProvider (no-op shell for integrators)
 *   - 'azure'       -> AzureSignedUrlProvider (no-op shell for integrators)
 *   - (unset/other) -> NotConfiguredSignedUrlProvider (throws a configured error)
 */
function signedUrlProviderFactory(): Type<SignedUrlProvider> {
  const provider = process.env.SIGNED_URL_PROVIDER?.toLowerCase();
  switch (provider) {
    case 's3':
      return S3SignedUrlProvider;
    case 'gcs':
      return GcsSignedUrlProvider;
    case 'azure':
      return AzureSignedUrlProvider;
    default:
      return NotConfiguredSignedUrlProvider;
  }
}

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [DocumentsController, DocumentsDownloadController],
  providers: [
    DocumentsService,
    DocumentUploadService,
    SignedUrlService,
    {
      provide: SIGNED_URL_PROVIDER_TOKEN,
      useClass: signedUrlProviderFactory(),
    },
  ],
  exports: [DocumentsService, DocumentUploadService],
})
export class DocumentsModule {}
