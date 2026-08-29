import { PrismaService } from '../../src/database/prisma.service';
import { ContentService } from '../../src/content/content.service';

describe('ContentService database integration', () => {
  let prisma: PrismaService;
  let service: ContentService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    service = new ContentService(prisma);
  });

  afterEach(async () => {
    await prisma.contentPage.deleteMany();
    await prisma.contentBanner.deleteMany();
    await prisma.contentFaq.deleteMany();
    await prisma.legalDocument.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('pages', () => {
    it('creates and reads a page', async () => {
      const created = await service.updatePage('about', {
        title: 'About PropChain',
        content: 'About us',
      });

      const page = await service.getPage('about');

      expect(page).toMatchObject({
        id: created.id,
        slug: 'about',
        title: 'About PropChain',
        content: 'About us',
      });
    });

    it('updates an existing page', async () => {
      await service.updatePage('about', {
        title: 'Old title',
        content: 'Old content',
      });

      const updated = await service.updatePage('about', {
        title: 'New title',
        content: 'New content',
      });

      expect(updated.title).toBe('New title');
      expect(updated.content).toBe('New content');
    });
  });

  describe('banners', () => {
    it('creates and reads banners in stable order', async () => {
      const first = await service.createBanner({
        imageUrl: 'https://example.com/first.png',
        sortOrder: 2,
      });

      const second = await service.createBanner({
        imageUrl: 'https://example.com/second.png',
        sortOrder: 1,
      });

      const banners = await service.getBanners();

      expect(banners.map((banner) => banner.id)).toEqual([
        second.id,
        first.id,
      ]);
    });

    it('updates a banner', async () => {
      const banner = await service.createBanner({
        imageUrl: 'https://example.com/old.png',
      });

      const updated = await service.updateBanner(banner.id, {
        imageUrl: 'https://example.com/new.png',
        link: 'https://example.com',
      });

      expect(updated.imageUrl).toBe('https://example.com/new.png');
      expect(updated.link).toBe('https://example.com');
    });
  });

  describe('FAQs', () => {
    it('creates and reads FAQs', async () => {
      const faq = await service.createFAQ({
        question: 'What is PropChain?',
        answer: 'A real estate platform.',
        sortOrder: 1,
      });

      const faqs = await service.getFAQs();

      expect(faqs).toHaveLength(1);
      expect(faqs[0]).toMatchObject({
        id: faq.id,
        question: 'What is PropChain?',
        answer: 'A real estate platform.',
      });
    });

    it('updates an FAQ', async () => {
      const faq = await service.createFAQ({
        question: 'Old question',
        answer: 'Old answer',
      });

      const updated = await service.updateFAQ(faq.id, {
        question: 'New question',
        answer: 'New answer',
      });

      expect(updated.question).toBe('New question');
      expect(updated.answer).toBe('New answer');
    });
  });

  describe('legal documents', () => {
    it('creates and reads legal content', async () => {
      await service.updateLegal('privacy-policy', {
        content: 'Privacy policy content',
      });

      const legal = await service.getLegal('privacy-policy');

      expect(legal).toMatchObject({
        type: 'privacy-policy',
        content: 'Privacy policy content',
      });
    });

    it('updates existing legal content', async () => {
      await service.updateLegal('terms', {
        content: 'Old terms',
      });

      const updated = await service.updateLegal('terms', {
        content: 'New terms',
      });

      expect(updated.content).toBe('New terms');
    });
  });
});