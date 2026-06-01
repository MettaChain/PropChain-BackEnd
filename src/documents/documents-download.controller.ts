import { Body, Controller, Get, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUserPayload } from '../auth/types/auth-user.type';
import { DownloadDocumentDto, RequestSignedUploadDto } from './dto/document-access.dto';
import { DocumentsService } from './documents.service';
import { SignedUrlService } from './signed-url/signed-url.service';
import { SignedUrlOperation } from './signed-url/signed-url-provider.interface';

@Controller('documents')
@UseGuards(JwtAuthGuard)
export class DocumentsDownloadController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly signedUrlService: SignedUrlService,
  ) {}

  /**
   * Download a document.
   * Authorization is enforced (document must belong to the requester).
   * Then we redirect to a short-lived signed GET URL.
   */
  @Get(':id/download')
  async download(
    @Param('id') id: string,
    @Query() query: DownloadDocumentDto,
    @CurrentUser() user: AuthUserPayload,
    @Res() res: Response,
  ) {
    const doc = await this.documentsService.findAuthorizedById(id, user.sub, (user as any).role);

    let targetFileUrl = doc.fileUrl;
    if (query.versionId) {
      const version = await this.documentsService.getVersion(id, query.versionId, user.sub, (user as any).role);
      targetFileUrl = version.fileUrl;
    }

    const objectKey = this.documentsService.toObjectKey(targetFileUrl);

    const signed = await this.signedUrlService.getSignedUrl({
      operation: 'download' as SignedUrlOperation,
      objectKey,
      contentType: doc.mimeType,
      expiresInSeconds: 60,
    });

    // Redirect keeps streaming off your API server.
    return res.redirect(signed.url);
  }

  /**
   * Request a signed upload URL for client-side upload.
   * Client uploads directly to object store, then calls document metadata create.
   */
  @Post('signed-upload-url')
  async requestSignedUploadUrl(
    @Body() dto: RequestSignedUploadDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    // Authorization: document metadata will ultimately be owned by the requester.
    // If dto.documentId exists, service should ensure requester owns it.
    const objectKey = await this.documentsService.buildUploadObjectKey({
      ...dto,
      userId: user.sub,
    });

    const signed = await this.signedUrlService.getSignedUrl({
      operation: 'upload',
      objectKey,
      contentType: dto.mimeType,
      contentLengthBytes: dto.fileSizeBytes,
      expiresInSeconds: 600,
    });

    return {
      url: signed.url,
      objectKey: signed.objectKey,
      expiresAt: signed.expiresAt,
    };
  }

  /**
   * Convenience endpoint: create document metadata after client uploads.
   * This expects that fileUrl points to the stored object (CDN URL or provider URL).
   */
  @Post('metadata')
  async createMetadata(@Body() dto: any, @CurrentUser() user: AuthUserPayload) {
    // This endpoint intentionally accepts CreateDocumentDto shape.
    return this.documentsService.create(dto, user.sub);
  }
}
