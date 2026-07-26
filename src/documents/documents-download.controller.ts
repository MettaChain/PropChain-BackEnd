// @ts-nocheck

import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiBody,
  ApiResponse,
} from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUserPayload } from '../auth/types/auth-user.type';
import {
  DownloadDocumentDto,
  RequestSignedUploadDto,
  SignedUploadUrlResponseDto,
} from './dto/document-access.dto';
import { DocumentsService } from './documents.service';
import { CreateDocumentDto } from './dto/document.dto';
import { SignedUrlService } from './signed-url/signed-url.service';
import { SignedUrlOperation } from './signed-url/signed-url-provider.interface';

@ApiTags('Documents')
@ApiBearerAuth()
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
  @ApiOperation({
    summary: 'Download a document',
    description: 'Authorizes access and redirects to a short-lived signed download URL.',
  })
  @ApiParam({ name: 'id', description: 'Document ID' })
  @ApiQuery({
    name: 'versionId',
    required: false,
    description: 'Optional version ID to download a specific version',
    type: String,
  })
  @ApiResponse({
    status: HttpStatus.FOUND,
    description: 'Redirects to a signed download URL',
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Document or version not found' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Access denied' })
  async download(
    @Param('id') id: string,
    @Query() query: DownloadDocumentDto,
    @CurrentUser() user: AuthUserPayload,
    @Res() res: Response,
  ) {
    const doc = await this.documentsService.findAuthorizedById(id, user.sub, user.role);

    let targetFileUrl = doc.fileUrl;
    if (query.versionId) {
      const version = await this.documentsService.getVersion(
        id,
        query.versionId,
        user.sub,
        user.role,
      );
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
   * Shared logic: build the signed PUT URL response for client-side upload.
   * The client's two-step flow is:
   *  1. POST /documents/upload-url -> receive `url` (where to PUT the bytes)
   *  2. PUT file to `url` directly against the storage provider
   *  3. POST /documents/metadata with the resulting objectKey
   *
   * Extracted from `requestSignedUploadUrl` so both routes (`/upload-url` per
   * issue #750 and `/signed-upload-url` for backward compatibility) share
   * identical behavior.
   */
  private async buildUploadUrlResponse(dto: RequestSignedUploadDto, user: AuthUserPayload) {
    // Authorization: document metadata will ultimately be owned by the requester.
    // If dto.documentId exists, the service should ensure the requester owns it.
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
   * Request a signed upload URL for client-side upload.
   * Client uploads directly to object store, then calls document metadata create.
   *
   * @deprecated Prefer `POST /documents/upload-url` (#750). This route is kept
   * for backward compatibility and will continue to work indefinitely.
   */
  @Post('signed-upload-url')
  @ApiOperation({
    summary: 'Request a signed upload URL',
    description: 'Returns a pre-signed URL for client-side direct upload to object storage.',
  })
  @ApiBody({ type: RequestSignedUploadDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Signed upload URL generated',
    type: SignedUploadUrlResponseDto,
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid request data' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Access denied' })
  async requestSignedUploadUrl(
    @Body() dto: RequestSignedUploadDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.buildUploadUrlResponse(dto, user);
  }

  /**
   * #750 — Two-step document upload: returns a short-lived signed PUT URL.
   * Client uploads the file directly to that URL, then calls
   * `POST /documents/metadata` with the returned `objectKey` to persist
   * document metadata.
   *
   * Behaviorally identical to `POST /documents/signed-upload-url`; the route
   * path matches the issue's spec.
   */
  @Post('upload-url')
  async requestUploadUrl(
    @Body() dto: RequestSignedUploadDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.buildUploadUrlResponse(dto, user);
  }

  /**
   * Convenience endpoint: create document metadata after client uploads.
   * This expects that fileUrl points to the stored object (CDN URL or provider URL).
   */
  @Post('metadata')
  async createMetadata(@Body() dto: CreateDocumentDto, @CurrentUser() user: AuthUserPayload) {
    // This endpoint intentionally accepts CreateDocumentDto shape.
    return this.documentsService.create(dto, user.sub);
  }
}
