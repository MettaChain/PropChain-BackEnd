import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  CreateBannerDto,
  CreateFaqDto,
  UpdateBannerDto,
  UpdateFaqDto,
  UpdateLegalDto,
  UpdatePageDto,
} from './dto';

@Injectable()
export class ContentService {
  constructor(private readonly prisma: PrismaService) {}

  async updatePage(slug: string, data: UpdatePageDto) {
    return this.prisma.contentPage.upsert({
      where: { slug },
      create: {
        slug,
        title: data.title,
        content: data.content,
      },
      update: {
        title: data.title,
        content: data.content,
      },
    });
  }

  async getPage(slug: string) {
    return this.prisma.contentPage.findUnique({
      where: { slug },
    });
  }

  async createBanner(data: CreateBannerDto) {
    return this.prisma.contentBanner.create({
      data: {
        imageUrl: data.imageUrl,
        link: data.link,
        sortOrder: data.sortOrder ?? 0,
      },
    });
  }

  async getBanners() {
    return this.prisma.contentBanner.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async updateBanner(id: string, data: UpdateBannerDto) {
    const banner = await this.prisma.contentBanner.findUnique({
      where: { id },
    });

    if (!banner) {
      throw new NotFoundException(`Banner ${id} not found`);
    }

    return this.prisma.contentBanner.update({
      where: { id },
      data,
    });
  }

  async createFAQ(data: CreateFaqDto) {
    return this.prisma.contentFaq.create({
      data: {
        question: data.question,
        answer: data.answer,
        sortOrder: data.sortOrder ?? 0,
      },
    });
  }

  async getFAQs() {
    return this.prisma.contentFaq.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async updateFAQ(id: string, data: UpdateFaqDto) {
    const faq = await this.prisma.contentFaq.findUnique({
      where: { id },
    });

    if (!faq) {
      throw new NotFoundException(`FAQ ${id} not found`);
    }

    return this.prisma.contentFaq.update({
      where: { id },
      data,
    });
  }

  async updateLegal(type: string, data: UpdateLegalDto) {
    return this.prisma.legalDocument.upsert({
      where: { type },
      create: {
        type,
        content: data.content,
      },
      update: {
        content: data.content,
      },
    });
  }

  async getLegal(type: string) {
    return this.prisma.legalDocument.findUnique({
      where: { type },
    });
  }
}