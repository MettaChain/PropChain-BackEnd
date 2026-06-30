import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Document, DocumentVersion, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AttachDocumentDto, AddVersionDto } from './dto/transaction-document.dto';

/** Minimal transaction fields needed for access control. */
type TxAccess = Pick<Prisma.TransactionGetPayload<object>, 'id' | 'buyerId' | 'sellerId'>;

/** Document with its ordered versions. */
type DocumentWithVersions = Document & { versions: DocumentVersion[] };

/** Document version with the uploader's public profile. */
type VersionWithUploader = DocumentVersion & {
  uploadedBy: { id: string; firstName: string; lastName: string; email: string } | null;
};

@Injectable()
export class TransactionDocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Throws NotFoundException when the transaction does not exist.
   * Used only by `attach` which has no document to co-fetch.
   */
  private async fetchTxAccess(transactionId: string): Promise<TxAccess> {
    const tx = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      select: { id: true, buyerId: true, sellerId: true },
    });
    if (!tx) throw new NotFoundException(`Transaction ${transactionId} not found`);
    return tx;
  }

  private assertAccess(tx: TxAccess, userId: string, userRole?: string): void {
    const isParty = tx.buyerId === userId || tx.sellerId === userId;
    const isPrivileged = userRole === 'ADMIN' || userRole === 'AGENT';
    if (!isParty && !isPrivileged) {
      throw new ForbiddenException('Access denied to this transaction document');
    }
  }

  // ---------------------------------------------------------------------------
  // Public methods
  // ---------------------------------------------------------------------------

  /**
   * Attach a new document to a transaction and record version 1.
   * 2 queries: (1) transaction access-select, (2) document create + version create
   * (version create is a separate write — not avoidable without denormalising).
   */
  async attach(
    transactionId: string,
    dto: AttachDocumentDto,
    userId: string,
    userRole?: string,
  ): Promise<Document> {
    const tx = await this.fetchTxAccess(transactionId);
    this.assertAccess(tx, userId, userRole);

    const document = await this.prisma.document.create({
      data: {
        transactionId,
        userId,
        documentType: dto.documentType,
        fileName: dto.fileName,
        fileUrl: dto.fileUrl,
        fileSize: dto.fileSize,
        mimeType: dto.mimeType,
        description: dto.description,
        stage: dto.stage ?? null,
        category: dto.documentType.toLowerCase().replace('_', '-'),
        auditTrail: [],
      },
    });

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

  /**
   * List all documents attached to a transaction.
   * Reduced from 2 sequential queries to 1 batched round-trip via
   * Prisma $transaction: transaction access-select + document list run
   * concurrently in the same connection checkout.
   */
  async list(
    transactionId: string,
    userId: string,
    userRole: string,
  ): Promise<DocumentWithVersions[]> {
    const [tx, documents] = await this.prisma.$transaction([
      this.prisma.transaction.findUnique({
        where: { id: transactionId },
        select: { id: true, buyerId: true, sellerId: true },
      }),
      this.prisma.document.findMany({
        where: { transactionId },
        orderBy: { createdAt: 'desc' },
        include: { versions: { orderBy: { versionNumber: 'asc' } } },
      }),
    ]);

    if (!tx) throw new NotFoundException(`Transaction ${transactionId} not found`);
    this.assertAccess(tx, userId, userRole);
    return documents;
  }

  /**
   * Get a single document (must belong to the transaction).
   * Reduced from 2 sequential queries to 1 batched round-trip:
   * transaction access-select + document-with-versions fetched together.
   */
  async findOne(
    transactionId: string,
    documentId: string,
    userId: string,
    userRole: string,
  ): Promise<DocumentWithVersions> {
    const [tx, doc] = await this.prisma.$transaction([
      this.prisma.transaction.findUnique({
        where: { id: transactionId },
        select: { id: true, buyerId: true, sellerId: true },
      }),
      this.prisma.document.findFirst({
        where: { id: documentId, transactionId },
        include: { versions: { orderBy: { versionNumber: 'asc' } } },
      }),
    ]);

    if (!tx) throw new NotFoundException(`Transaction ${transactionId} not found`);
    this.assertAccess(tx, userId, userRole);
    if (!doc) throw new NotFoundException('Document not found for this transaction');
    return doc;
  }

  /**
   * Add a new version to an existing transaction document.
   * Reduced from 2 sequential read queries to 1 batched round-trip:
   * transaction access-select + document-with-versions fetched together,
   * followed by the single write batch (version create + document update).
   */
  async addVersion(
    transactionId: string,
    documentId: string,
    dto: AddVersionDto,
    userId: string,
    userRole: string,
  ): Promise<DocumentVersion> {
    const [tx, doc] = await this.prisma.$transaction([
      this.prisma.transaction.findUnique({
        where: { id: transactionId },
        select: { id: true, buyerId: true, sellerId: true },
      }),
      this.prisma.document.findFirst({
        where: { id: documentId, transactionId },
        include: { versions: { orderBy: { versionNumber: 'asc' } } },
      }),
    ]);

    if (!tx) throw new NotFoundException(`Transaction ${transactionId} not found`);
    this.assertAccess(tx, userId, userRole);
    if (!doc) throw new NotFoundException('Document not found for this transaction');

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
      this.prisma.document.update({
        where: { id: documentId },
        data: { fileUrl: dto.fileUrl, fileName: dto.fileName, fileSize: dto.fileSize },
      }),
    ]);

    return version;
  }

  /**
   * List all versions of a document.
   *
   * Previously made 3 sequential round-trips:
   *   1. ensureTransactionExists
   *   2. document.findFirst  (existence check only)
   *   3. documentVersion.findMany  (with uploadedBy)
   *
   * Now consolidated to 1 batched round-trip: transaction access fields +
   * document-with-versions-and-uploader fetched together.
   */
  async getVersions(
    transactionId: string,
    documentId: string,
    userId: string,
    userRole: string,
  ): Promise<VersionWithUploader[]> {
    const [tx, doc] = await this.prisma.$transaction([
      this.prisma.transaction.findUnique({
        where: { id: transactionId },
        select: { id: true, buyerId: true, sellerId: true },
      }),
      this.prisma.document.findFirst({
        where: { id: documentId, transactionId },
        include: {
          versions: {
            orderBy: { versionNumber: 'asc' },
            include: {
              uploadedBy: {
                select: { id: true, firstName: true, lastName: true, email: true },
              },
            },
          },
        },
      }),
    ]);

    if (!tx) throw new NotFoundException(`Transaction ${transactionId} not found`);
    this.assertAccess(tx, userId, userRole);
    if (!doc) throw new NotFoundException('Document not found for this transaction');

    return doc.versions as VersionWithUploader[];
  }

  /**
   * Remove a document from a transaction.
   * Reduced from 2 sequential read queries to 1 batched round-trip:
   * transaction access-select + document existence check fetched together.
   */
  async remove(
    transactionId: string,
    documentId: string,
    userId: string,
    userRole: string,
  ): Promise<Document> {
    const [tx, doc] = await this.prisma.$transaction([
      this.prisma.transaction.findUnique({
        where: { id: transactionId },
        select: { id: true, buyerId: true, sellerId: true },
      }),
      this.prisma.document.findFirst({
        where: { id: documentId, transactionId },
      }),
    ]);

    if (!tx) throw new NotFoundException(`Transaction ${transactionId} not found`);
    this.assertAccess(tx, userId, userRole);
    if (!doc) throw new NotFoundException('Document not found for this transaction');

    return this.prisma.document.delete({ where: { id: documentId } });
  }
}
