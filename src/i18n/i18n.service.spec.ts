import { I18nService, DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from './i18n.service';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

function writeCatalogue(dir: string, lang: string, payload: Record<string, unknown>): void {
  fs.writeFileSync(path.join(dir, `${lang}.json`), JSON.stringify(payload));
}

describe('I18nService', () => {
  let tmpDir: string;
  let service: I18nService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-test-'));
    writeCatalogue(tmpDir, 'en', {
      common: { not_found: 'Resource not found' },
      welcome: 'Hello {name}',
      fallback: 'English fallback',
    });
    writeCatalogue(tmpDir, 'es', {
      common: { not_found: 'Recurso no encontrado' },
      welcome: 'Hola {name}',
    });
    service = new I18nService(tmpDir);
    service.onModuleInit();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('exposes the supported language set', () => {
    expect(SUPPORTED_LANGUAGES).toContain('en');
    expect(SUPPORTED_LANGUAGES).toContain('es');
    expect(DEFAULT_LANGUAGE).toBe('en');
  });

  it('translates a dotted key for the requested language', () => {
    expect(service.translate('common.not_found', { acceptLanguageHeader: 'es' })).toBe(
      'Recurso no encontrado',
    );
    expect(service.translate('common.not_found', { acceptLanguageHeader: 'en' })).toBe(
      'Resource not found',
    );
  });

  it('prefers user preference over Accept-Language', () => {
    expect(
      service.translate('common.not_found', {
        userPreference: 'es',
        acceptLanguageHeader: 'en',
      }),
    ).toBe('Recurso no encontrado');
  });

  it('falls back to English when language is unsupported', () => {
    expect(service.translate('common.not_found', { acceptLanguageHeader: 'fr' })).toBe(
      'Resource not found',
    );
  });

  it('interpolates template parameters', () => {
    expect(service.tFor('welcome', 'en', { name: 'Ada' })).toBe('Hello Ada');
    expect(service.tFor('welcome', 'es', { name: 'Ada' })).toBe('Hola Ada');
  });

  it('falls back to default language when key is missing', () => {
    expect(service.tFor('fallback', 'es')).toBe('English fallback');
  });

  it('returns the key itself when missing in every catalogue', () => {
    expect(service.tFor('not.a.key', 'en')).toBe('not.a.key');
  });

  describe('parseAcceptLanguage', () => {
    it('honours the highest-quality supported tag', () => {
      expect(service.parseAcceptLanguage('fr;q=0.9, es;q=1.0, en;q=0.5')).toBe('es');
    });

    it('handles a single-language header', () => {
      expect(service.parseAcceptLanguage('es')).toBe('es');
    });

    it('returns null for empty / all-unsupported headers', () => {
      expect(service.parseAcceptLanguage('')).toBeNull();
      expect(service.parseAcceptLanguage('fr;q=0.8, de;q=0.6')).toBeNull();
    });

    it('treats language-region tags (e.g. en-US) as their base', () => {
      expect(service.parseAcceptLanguage('en-US')).toBe('en');
      expect(service.parseAcceptLanguage('es-MX, en;q=0.8')).toBe('es');
    });
  });

  describe('catalogue loading', () => {
    it('keeps functioning when a translation file is missing', () => {
      const missingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-missing-'));
      writeCatalogue(missingDir, 'en', { common: { not_found: 'Missing EN' } });
      const isolated = new I18nService(missingDir);
      isolated.onModuleInit();
      expect(isolated.translate('common.not_found', {})).toBe('Missing EN');
      expect(isolated.tFor('common.not_found', 'es')).toBe('Missing EN'); // en fallback
      fs.rmSync(missingDir, { recursive: true, force: true });
    });
  });
});
