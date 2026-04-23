import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  CreateVerificationDocumentDto,
  ReviewVerificationDocumentDto,
  UpdateVerificationDocumentDto,
} from './dto/verification-document.dto';
import { VerificationStatus } from '@prisma/client';

@Injectable()
export class VerificationDocumentsService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, data: CreateVerificationDocumentDto) {
    return this.prisma.verificationDocument.create({
      data: {
        userId,
        documentType: data.documentType,
        fileName: data.fileName,
        fileUrl: data.fileUrl,
        fileSize: parseInt(data.fileSize),
        mimeType: data.mimeType,
        status: 'PENDING',
      },
    });
  }

  async findAllByUserId(userId: string) {
    return this.prisma.verificationDocument.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, userId: string) {
    const document = await this.prisma.verificationDocument.findUnique({
      where: { id },
    });

    if (!document) {
      throw new NotFoundException('Verification document not found');
    }

    if (document.userId !== userId) {
      throw new ForbiddenException('You do not have access to this document');
    }

    return document;
  }

  async update(id: string, userId: string, data: UpdateVerificationDocumentDto) {
    const document = await this.findOne(id, userId);

    // Only allow updates if document is still pending
    if (document.status !== 'PENDING') {
      throw new ForbiddenException('Cannot update a document that has been reviewed');
    }

    return this.prisma.verificationDocument.update({
      where: { id },
      data,
    });
  }

  async review(id: string, adminId: string, data: ReviewVerificationDocumentDto) {
    const document = await this.prisma.verificationDocument.findUnique({
      where: { id },
    });

    if (!document) {
      throw new NotFoundException('Verification document not found');
    }

    return this.prisma.verificationDocument.update({
      where: { id },
      data: {
        status: data.status,
        adminNotes: data.adminNotes,
        reviewedBy: adminId,
        reviewedAt: new Date(),
      },
    });
  }

  async remove(id: string, userId: string) {
    const document = await this.findOne(id, userId);

    // Only allow deletion if document is still pending
    if (document.status !== 'PENDING') {
      throw new ForbiddenException('Cannot delete a document that has been reviewed');
    }

    return this.prisma.verificationDocument.delete({
      where: { id },
    });
  }

  // Admin methods
  async findAllForAdmin(page = 1, limit = 20, status?: string) {
    const skip = (page - 1) * limit;

    const where: any = status ? { status: status as VerificationStatus } : {};

    const [documents, total] = await Promise.all([
      this.prisma.verificationDocument.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
      this.prisma.verificationDocument.count({ where }),
    ]);

    return {
      documents,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
