import { Injectable } from '@nestjs/common';

@Injectable()
export class ContentService {
  private pages = new Map<string, any>();
  private banners: any[] = [];
  private faqs: any[] = [];
  private legal = new Map<string, string>();

  updatePage(slug: string, data: { title: string; content: string }) {
    this.pages.set(slug, { slug, ...data });
    return this.pages.get(slug);
  }

  getPage(slug: string) {
    return this.pages.get(slug) || null;
  }

  createBanner(data: { imageUrl: string; link?: string }) {
    const banner = { id: Date.now().toString(), ...data };
    this.banners.push(banner);
    return banner;
  }

  getBanners() {
    return this.banners;
  }

  createFAQ(data: { question: string; answer: string }) {
    const faq = { id: Date.now().toString(), ...data };
    this.faqs.push(faq);
    return faq;
  }

  getFAQs() {
    return this.faqs;
  }

  updateLegal(type: string, content: string) {
    this.legal.set(type, content);
    return { type, content };
  }

  getLegal(type: string) {
    return this.legal.get(type) || null;
  }
}
