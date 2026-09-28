import { I18nService, DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from './i18n.service';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

function writeCatalogue(
  dir: string,
  lang: string,
  payload: Record<string, unknown> | string,
): void {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  fs.writeFileSync(path.join(dir, `${lang}.json`), body);
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
      nested: { a: { b: 'deep' }, list: ['x', 'y'] },
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

  it('leaves placeholder when interpolation param is missing', () => {
    expect(service.tFor('welcome', 'en', {})).toBe('Hello {name}');
    expect(service.tFor('welcome', 'en')).toBe('Hello {name}');
  });

  it('falls back to default language when key is missing', () => {
    expect(service.tFor('fallback', 'es')).toBe('English fallback');
  });

  it('returns the key itself when missing in every catalogue', () => {
    expect(service.tFor('not.a.key', 'en')).toBe('not.a.key');
  });

  describe('nested lookup', () => {
    it('resolves deep object paths', () => {
      expect(service.tFor('nested.a.b', 'en')).toBe('deep');
    });

    it('returns key when intermediate segment is an array (non-object)', () => {
      expect(service.tFor('nested.list.0', 'en')).toBe('nested.list.0');
    });

    it('returns key when intermediate is missing', () => {
      expect(service.tFor('nested.missing.child', 'en')).toBe('nested.missing.child');
    });
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
      expect(service.parseAcceptLanguage(null)).toBeNull();
      expect(service.parseAcceptLanguage(undefined)).toBeNull();
      expect(service.parseAcceptLanguage('fr;q=0.8, de;q=0.6')).toBeNull();
    });

    it('treats language-region tags (e.g. en-US) as their base', () => {
      expect(service.parseAcceptLanguage('en-US')).toBe('en');
      expect(service.parseAcceptLanguage('es-MX, en;q=0.8')).toBe('es');
    });

    it('ignores tags with q=0', () => {
      expect(service.parseAcceptLanguage('es;q=0, en;q=0.5')).toBe('en');
      expect(service.parseAcceptLanguage('es;q=0')).toBeNull();
    });

    it('handles wildcard * by falling through to next supported or null', () => {
      expect(service.parseAcceptLanguage('*')).toBeNull();
      expect(service.parseAcceptLanguage('es, *;q=0.1')).toBe('es');
    });

    it('sorts by q then by original order for equal q', () => {
      expect(service.parseAcceptLanguage('en;q=0.5, es;q=0.5')).toBe('en');
    });
  });

  describe('catalogue loading failure / fallback', () => {
    it('keeps functioning when a translation file is missing', () => {
      const missingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-missing-'));
      writeCatalogue(missingDir, 'en', { common: { not_found: 'Missing EN' } });
      const isolated = new I18nService(missingDir);
      isolated.onModuleInit();
      expect(isolated.translate('common.not_found', {})).toBe('Missing EN');
      expect(isolated.tFor('common.not_found', 'es')).toBe('Missing EN');
      fs.rmSync(missingDir, { recursive: true, force: true });
    });

    it('installs empty catalogue and logs warning on malformed JSON', () => {
      const badDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-bad-'));
      writeCatalogue(badDir, 'en', { common: { not_found: 'OK EN' } });
      writeCatalogue(badDir, 'es', '{ this is not valid json');
      const isolated = new I18nService(badDir);
      const warnSpy = jest
        .spyOn((isolated as any).logger, 'warn')
        .mockImplementation(() => undefined);
      isolated.onModuleInit();

      expect(warnSpy).toHaveBeenCalled();
      const warnMsg = String(warnSpy.mock.calls[0]?.[0] ?? '');
      expect(warnMsg).toMatch(/Failed to load translations for "es"/);

      expect(isolated.tFor('common.not_found', 'es')).toBe('OK EN');
      expect(isolated.tFor('only.es.key', 'es')).toBe('only.es.key');
      expect(isolated.hasLanguage('es')).toBe(true);

      warnSpy.mockRestore();
      fs.rmSync(badDir, { recursive: true, force: true });
    });

    it('degrades to key return when both catalogues fail to load', () => {
      const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-empty-'));
      const isolated = new I18nService(emptyDir);
      jest.spyOn((isolated as any).logger, 'warn').mockImplementation(() => undefined);
      isolated.onModuleInit();
      expect(isolated.tFor('any.key', 'en')).toBe('any.key');
      expect(isolated.tFor('any.key', 'es')).toBe('any.key');
      fs.rmSync(emptyDir, { recursive: true, force: true });
    });
  });
});

describe('i18n missing key observability (issue #1236)', () => {
  let dir: string;
  let svc: I18nService;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-miss-'));
    writeCatalogue(dir, 'en', { common: { not_found: 'Resource not found' } });
    writeCatalogue(dir, 'es', {});
    svc = new I18nService(dir);
    svc.onModuleInit();
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('records a miss and still returns the raw key', () => {
    svc.clearRecentMisses();
    expect(svc.tFor('not.a.key', 'en')).toBe('not.a.key');
    const misses = svc.getRecentMisses();
    expect(misses.length).toBeGreaterThanOrEqual(1);
    expect(misses.some((m) => m.key === 'not.a.key' && m.language === 'en')).toBe(true);
  });

  it('increments count on repeated misses', () => {
    svc.clearRecentMisses();
    svc.tFor('ghost.key', 'es');
    svc.tFor('ghost.key', 'es');
    const entry = svc.getRecentMisses().find((m) => m.key === 'ghost.key');
    expect(entry?.count).toBe(2);
  });
});
