import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AttachDocumentDto, AddVersionDto } from './dto/transaction-document.dto';

@Injectable()
export class TransactionDocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Attach a new document to a transaction and record version 1. */
  async attach(transactionId: string, dto: AttachDocumentDto, userId: string, userRole?: string) {
    const tx = await this.ensureTransactionExists(transactionId);
    this.assertAccess(tx, userId, userRole);

    const document = await this.prisma.document.create({
      data: {
        transactionId,
        userId,
        documentType: dto.documentType as any,
        fileName: dto.fileName,
        fileUrl: dto.fileUrl,
        fileSize: dto.fileSize,
        mimeType: dto.mimeType,
        description: dto.description,
        stage: dto.stage ?? null,
        category: dto.documentType.toLowerCase().replace('_', '-'),
        auditTrail: [],
      } as any,
    });

    // Record initial version
    await this.prisma.documentVersion.create({
      data: {
        documentId: document.id,
        versionNumber: 1,
        fileUrl: dto.fileUrl,
        fileName: dto.fileName,
        fileSize: dto.fileSize,
        uploadedById: userId,
        changeNote: dto.changeNote ?? 'Initial version',
      },
    });

    return document;
  }

  /** List all documents attached to a transaction. */
  async list(transactionId: string, userId?: string, userRole?: string) {
    const tx = await this.ensureTransactionExists(transactionId);
    if (userId) this.assertAccess(tx, userId, userRole);
    return this.prisma.document.findMany({
      where: { transactionId },
      orderBy: { createdAt: 'desc' },
      include: { versions: { orderBy: { versionNumber: 'asc' } } },
    });
  }

  /** Get a single document (must belong to the transaction). */
  async findOne(transactionId: string, documentId: string) {
    const doc = await this.prisma.document.findFirst({
      where: { id: documentId, transactionId },
      include: { versions: { orderBy: { versionNumber: 'asc' } } },
    });
    if (!doc) throw new NotFoundException('Document not found for this transaction');
    return doc;
  }

  /** Add a new version to an existing transaction document. */
  async addVersion(transactionId: string, documentId: string, dto: AddVersionDto, userId: string) {
    const doc = await this.findOne(transactionId, documentId);

    const nextVersion = (doc.versions?.length ?? 0) + 1;

    const [version] = await this.prisma.$transaction([
      this.prisma.documentVersion.create({
        data: {
          documentId,
          versionNumber: nextVersion,
          fileUrl: dto.fileUrl,
          fileName: dto.fileName,
          fileSize: dto.fileSize,
          uploadedById: userId,
          changeNote: dto.changeNote,
        },
      }),
      // Update the document to point to the latest file
      this.prisma.document.update({
        where: { id: documentId },
        data: { fileUrl: dto.fileUrl, fileName: dto.fileName, fileSize: dto.fileSize },
      }),
    ]);

    return version;
  }

  /** List all versions of a document. */
  async getVersions(transactionId: string, documentId: string) {
    await this.findOne(transactionId, documentId);
    return this.prisma.documentVersion.findMany({
      where: { documentId },
      orderBy: { versionNumber: 'asc' },
      include: {
        uploadedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
  }

  /** Remove a document from a transaction. */
  async remove(transactionId: string, documentId: string) {
    await this.findOne(transactionId, documentId);
    return this.prisma.document.delete({ where: { id: documentId } });
  }

  private async ensureTransactionExists(transactionId: string) {
    const tx = await this.prisma.transaction.findUnique({ where: { id: transactionId } });
    if (!tx) throw new NotFoundException(`Transaction ${transactionId} not found`);
    return tx;
  }

  private assertAccess(tx: any, userId: string, userRole?: string) {
    const isParty = tx.buyerId === userId || tx.sellerId === userId;
    const isPrivileged = userRole === 'ADMIN' || userRole === 'AGENT';
    if (!isParty && !isPrivileged) {
      throw new ForbiddenException('Access denied to this transaction document');
    }
  }
}
