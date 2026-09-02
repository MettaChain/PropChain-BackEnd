import { ContentService } from './content.service';

describe('ContentService', () => {
  let service: ContentService;

  beforeEach(() => {
    service = new ContentService();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('getPage returns null when page does not exist', () => {
    const result = service.getPage('nonexistent');
    expect(result).toBeNull();
  });

  it('updatePage stores and returns page', () => {
    const result = service.updatePage('about', { title: 'About', content: 'Us' });
    expect(result).toEqual({ slug: 'about', title: 'About', content: 'Us' });
  });

  it('getBanners returns empty array initially', () => {
    expect(service.getBanners()).toEqual([]);
  });

  it('createBanner adds a banner and returns it', () => {
    const banner = service.createBanner({ imageUrl: 'http://img.test/a.png' });
    expect(banner).toHaveProperty('id');
    expect(banner.imageUrl).toBe('http://img.test/a.png');
    expect(service.getBanners()).toHaveLength(1);
  });

  it('getFAQs returns empty array initially', () => {
    expect(service.getFAQs()).toEqual([]);
  });

  it('getLegal returns null when not set', () => {
    expect(service.getLegal('privacy')).toBeNull();
  });

  it('updateLegal stores content and getLegal retrieves it', () => {
    service.updateLegal('terms', 'Terms text');
    expect(service.getLegal('terms')).toBe('Terms text');
  });
});
