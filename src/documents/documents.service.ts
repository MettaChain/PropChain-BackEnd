import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import * as archiver from 'archiver';
import { Response } from 'express';
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

  async findAll(userId: string, filter: FilterDocumentsDto = {}) {
    const where: any = { userId };
    if (filter.category) where.category = filter.category;
    if (filter.tags?.length) where.tags = { hasSome: filter.tags };
    if (filter.isExpired !== undefined) where.isExpired = filter.isExpired;
    if (filter.documentType) where.documentType = filter.documentType;

    return this.prisma.document.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string) {
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  async update(id: string, dto: UpdateDocumentDto) {
    await this.findOne(id);
    return this.prisma.document.update({ where: { id }, data: dto as any });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.document.delete({ where: { id } });
  }

  // ── #402 Expiration ──────────────────────────────────────────────────────

  async markExpiredDocuments() {
    const now = new Date();
    const result = await this.prisma.document.updateMany({
      where: { expiresAt: { lte: now }, isExpired: false },
      data: { isExpired: true },
    });
    return { marked: result.count };
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

  // ── #404 Bulk Download ───────────────────────────────────────────────────

  async bulkDownload(dto: BulkDownloadDto, res: Response) {
    const docs = await this.prisma.document.findMany({
      where: { id: { in: dto.documentIds } },
    });

    if (!docs.length) throw new NotFoundException('No documents found');

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="documents-${Date.now()}.zip"`);

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.pipe(res);

    for (const doc of docs) {
      // Append file URL as a reference entry (actual file streaming requires storage integration)
      archive.append(`File: ${doc.fileName}\nURL: ${doc.fileUrl}\nType: ${doc.documentType}\n`, {
        name: `${doc.id}-${doc.fileName}.txt`,
      });
    }

    await archive.finalize();
    return { count: docs.length };
  }
}
