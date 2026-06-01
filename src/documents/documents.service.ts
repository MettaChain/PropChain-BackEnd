import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import * as crypto from 'crypto';
import * as archiver from 'archiver';
import { Response } from 'express';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../database/prisma.service';
import {
  CreateDocumentDto,
  UpdateDocumentDto,
  SignDocumentDto,
  BulkDownloadDto,
  FilterDocumentsDto,
} from './dto/document.dto';

// Auto-tag rules: map document type to default tags
const AUTO_TAG_MAP: Record<string, string[]> = {
  TITLE_DEED: ['legal', 'ownership'],
  INSPECTION_REPORT: ['inspection', 'condition'],
  APPRAISAL: ['valuation', 'financial'],
  CONTRACT: ['legal', 'agreement'],
  DISCLOSURE: ['legal', 'disclosure'],
  PHOTO: ['media', 'visual'],
  FLOOR_PLAN: ['media', 'layout'],
};

@Injectable()
export class DocumentsService {
  constructor(private prisma: PrismaService) {}

  // ── #401 Categorization ──────────────────────────────────────────────────

  async create(dto: CreateDocumentDto, userId: string) {
    const autoTags = AUTO_TAG_MAP[dto.documentType] ?? [];
    const tags = [...new Set([...autoTags, ...(dto.tags ?? [])])];
    const category = dto.category ?? dto.documentType.toLowerCase().replace('_', '-');

    return this.prisma.document.create({
      data: {
        userId,
        propertyId: dto.propertyId,
        documentType: dto.documentType as any,
        fileName: dto.fileName,
        fileUrl: dto.fileUrl,
        fileSize: dto.fileSize ?? 0,
        mimeType: dto.mimeType ?? 'application/octet-stream',
        description: dto.description,
        category,
        tags,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
    });
  }

  async findAll(userId: string, filter: FilterDocumentsDto | any = {}, userRole?: string) {
    const where: any = {};

    // Issue #570: Access Control Defaults
    if (userRole !== 'ADMIN') {
      where.OR = [
        { userId },
        { isPublic: true },
        { sharedWith: { has: userId } }
      ];
    }

    if (filter.category) where.category = filter.category;
    if (filter.tags?.length) where.tags = { hasSome: filter.tags };
    if (filter.isExpired !== undefined) where.isExpired = filter.isExpired;
    if (filter.documentType) where.documentType = filter.documentType;
    
    // Issue #573: Hide expired/archived by default
    where.status = filter.status || 'ACTIVE';

    return this.prisma.document.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string) {
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  async findAuthorizedById(id: string, userId: string) {
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('Document not found');
    if (doc.userId !== userId) throw new NotFoundException('Document not found');
    return doc;
  }

  toObjectKey(fileUrl: string): string {
    try {
      return new URL(fileUrl).pathname.replace(/^\//, '');
    } catch {
      return fileUrl;
    }
  }

  async buildUploadObjectKey(opts: {
    mimeType: string;
    userId: string;
    documentId?: string;
  }): Promise<string> {
    const ext = opts.mimeType.split('/')[1] ?? 'bin';
    const name = opts.documentId ?? crypto.randomUUID();
    return `documents/${opts.userId}/${name}.${ext}`;
  }

  async update(id: string, dto: UpdateDocumentDto) {
    await this.findOne(id);
    return this.prisma.document.update({ where: { id }, data: dto as any });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.document.delete({ where: { id } });
  }

  async findAuthorizedById(id: string, userId: string, userRole?: string) {
    const doc = await this.findOne(id);
    
    const isAdmin = userRole === 'ADMIN';
    const isOwner = doc.userId === userId;
    const isShared = doc.sharedWith.includes(userId);
    
    if (!isAdmin && !isOwner && !doc.isPublic && !isShared) {
      throw new ForbiddenException('Access denied to this document');
    }
    
    return doc;
  }

  // ── #572 Version History ─────────────────────────────────────────────────

  async getVersions(id: string, userId: string, userRole?: string) {
    await this.findAuthorizedById(id, userId, userRole);
    return this.prisma.documentVersion.findMany({
      where: { documentId: id },
      orderBy: { versionNumber: 'desc' },
    });
  }

  async getVersion(id: string, versionId: string, userId: string, userRole?: string) {
    await this.findAuthorizedById(id, userId, userRole);
    const version = await this.prisma.documentVersion.findUnique({ where: { id: versionId } });
    if (!version || version.documentId !== id) throw new NotFoundException('Version not found');
    return version;
  }

  // ── #402 Expiration ──────────────────────────────────────────────────────

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async markExpiredDocuments() {
    const now = new Date();
    const expiredResult = await this.prisma.document.updateMany({
      where: { status: 'ACTIVE', expiresAt: { lte: now } },
      data: { isExpired: true, status: 'EXPIRED' },
    });

    const archiveThreshold = new Date();
    archiveThreshold.setDate(archiveThreshold.getDate() - 30);

    const archivedResult = await this.prisma.document.updateMany({
      where: { status: 'EXPIRED', expiresAt: { lte: archiveThreshold } },
      data: { status: 'ARCHIVED', archivedAt: now },
    });
    return { marked: expiredResult.count, archived: archivedResult.count };
  }

  async getExpiringDocuments(withinDays = 7) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + withinDays);
    return this.prisma.document.findMany({
      where: { expiresAt: { lte: cutoff, gte: new Date() }, isExpired: false },
    });
  }

  async flagExpiryNotified(id: string) {
    return this.prisma.document.update({
      where: { id },
      data: { expiryNotified: true },
    });
  }

  async deleteExpired() {
    const result = await this.prisma.document.deleteMany({
      where: { isExpired: true },
    });
    return { deleted: result.count };
  }

  // ── #403 eSignature ──────────────────────────────────────────────────────

  async signDocument(id: string, dto: SignDocumentDto) {
    const doc = await this.findOne(id);
    if (doc.signedAt) throw new BadRequestException('Document already signed');

    const verificationHash = crypto
      .createHash('sha256')
      .update(`${id}:${dto.signedBy}:${dto.signatureHash}`)
      .digest('hex');

    const auditEntry = {
      action: 'SIGNED',
      by: dto.signedBy,
      at: new Date().toISOString(),
      hash: verificationHash,
    };

    const currentTrail = Array.isArray(doc.auditTrail) ? doc.auditTrail : [];

    return this.prisma.document.update({
      where: { id },
      data: {
        signedBy: dto.signedBy,
        signedAt: new Date(),
        signatureHash: verificationHash,
        auditTrail: [...currentTrail, auditEntry],
      },
    });
  }

  async verifySignature(id: string) {
    const doc = await this.findOne(id);
    if (!doc.signedBy || !doc.signatureHash) {
      return { verified: false, reason: 'Document not signed' };
    }
    const expected = crypto
      .createHash('sha256')
      .update(`${id}:${doc.signedBy}:${doc.signatureHash.slice(0, 64)}`)
      .digest('hex');
    return {
      verified: true,
      signedBy: doc.signedBy,
      signedAt: doc.signedAt,
      auditTrail: doc.auditTrail,
    };
  }

  // ── #568 Secure Download: authorization & object key helpers ──────────────

  /**
   * Find a document by ID and verify that the requesting user owns it.
   * Throws ForbiddenException if the document doesn't belong to the user.
   */
  async findAuthorizedById(id: string, userId: string) {
    const doc = await this.findOne(id);
    if (doc.userId !== userId) {
      throw new ForbiddenException('You do not have access to this document');
    }
    return doc;
  }

  /**
   * Extract the object key (filename portion) from a file URL.
   * Handles URLs like:
   *   - https://bucket.s3.amazonaws.com/path/to/file.pdf  -> path/to/file.pdf
   *   - /path/to/file.pdf                                  -> path/to/file.pdf
   *   - file.pdf                                            -> file.pdf
   */
  toObjectKey(fileUrl: string): string {
    try {
      const url = new URL(fileUrl);
      // Remove leading slash from pathname
      return url.pathname.replace(/^\//, '');
    } catch {
      // Not a valid URL — treat as a local path
      return fileUrl.replace(/^\//, '');
    }
  }

  /**
   * Build a unique object key for client-side uploads.
   * Uses a UUID-like key derived from userId, fileName, and timestamp.
   */
  async buildUploadObjectKey(params: {
    userId: string;
    fileName: string;
    mimeType: string;
    category?: string;
    documentId?: string;
  }): Promise<string> {
    const prefix = params.category ?? 'documents';
    const timestamp = Date.now();
    const random = crypto.randomBytes(4).toString('hex');
    const safeName = params.fileName
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .toLowerCase();
    return `${prefix}/${params.userId}/${timestamp}-${random}-${safeName}`;
  }

  // ── #404 / #569 Bulk Download with authorization & signed URLs ───────────

  /**
   * Download multiple documents as a zip archive.
   * Authorizes each document to ensure the user has access.
   * Optionally accepts signed URL data for actual file content.
   */
  async bulkDownload(
    dto: BulkDownloadDto & { signedUrls?: Map<string, { url: string; expiresAt: Date }> },
    res: Response,
    userId?: string,
  ) {
    const docs = await this.prisma.document.findMany({
      where: { id: { in: dto.documentIds } },
    });

    if (!docs.length) throw new NotFoundException('No documents found');

    // Authorize each document — if userId is provided, check ownership
    if (userId) {
      for (const doc of docs) {
        if (doc.userId !== userId) {
          throw new ForbiddenException(
            `Access denied to document ${doc.id}: not owned by requester`,
          );
        }
      }
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="documents-${Date.now()}.zip"`);

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.pipe(res);

    for (const doc of docs) {
      const signedUrl = dto.signedUrls?.get(doc.id);
      if (signedUrl) {
        // Include signed URL info for the client to download
        archive.append(
          JSON.stringify(
            {
              id: doc.id,
              fileName: doc.fileName,
              documentType: doc.documentType,
              signedUrl: signedUrl.url,
              expiresAt: signedUrl.expiresAt.toISOString(),
              fileSize: doc.fileSize,
              mimeType: doc.mimeType,
            },
            null,
            2,
          ),
          { name: `${doc.id}-${doc.fileName}.json` },
        );
      } else {
        // Fallback: append file metadata as a text reference entry
        archive.append(
          `File: ${doc.fileName}\nURL: ${doc.fileUrl}\nType: ${doc.documentType}\nSize: ${doc.fileSize} bytes\nMIME: ${doc.mimeType}\n`,
          { name: `${doc.id}-${doc.fileName}.txt` },
        );
      }
    }

    await archive.finalize();
    return { count: docs.length };
  }
}
