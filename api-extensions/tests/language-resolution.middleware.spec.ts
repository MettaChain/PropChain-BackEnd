import { NextFunction, Request, Response } from 'express';
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_RESOLUTION_OPTIONS,
  LanguageAwareRequest,
  LanguageResolutionMiddleware,
  normaliseLanguage,
  parseAcceptLanguage,
} from '../modules/language-resolution/language-resolution.middleware';

function requestWith(overrides: Record<string, unknown> = {}): LanguageAwareRequest {
  return { headers: {}, ...overrides } as unknown as LanguageAwareRequest;
}

function run(middleware: LanguageResolutionMiddleware, request: LanguageAwareRequest): jest.Mock {
  const next = jest.fn();
  middleware.use(request as unknown as Request, {} as Response, next as unknown as NextFunction);
  return next;
}

describe('LanguageResolutionMiddleware (#1606)', () => {
  const middleware = new LanguageResolutionMiddleware();

  it('exposes its options token', () => {
    expect(LANGUAGE_RESOLUTION_OPTIONS).toBeDefined();
  });

  it('prefers the X-Language header over every other source', () => {
    const req = requestWith({
      headers: { 'x-language': 'es', 'accept-language': 'en-US,en;q=0.9' },
      authUser: { languagePreference: 'en' },
    });

    expect(run(middleware, req)).toHaveBeenCalledTimes(1);
    expect(req.language).toBe('es');
  });

  it('falls back to the authenticated user preference', () => {
    const req = requestWith({
      headers: { 'accept-language': 'en-US,en;q=0.9' },
      authUser: { languagePreference: 'es-MX' },
    });

    run(middleware, req);
    expect(req.language).toBe('es');
  });

  it('falls back to Accept-Language quality ordering', () => {
    const req = requestWith({
      headers: { 'accept-language': 'fr-FR,es;q=0.8,en;q=0.5' },
    });

    run(middleware, req);
    expect(req.language).toBe('es');
  });

  it('defaults to en when nothing supported is supplied', () => {
    const req = requestWith({ headers: { 'accept-language': 'de-DE' } });

    run(middleware, req);
    expect(req.language).toBe(DEFAULT_LANGUAGE);
  });

  it('skips unsupported X-Language values and continues down the chain', () => {
    const req = requestWith({
      headers: { 'x-language': 'klingon', 'accept-language': 'es' },
    });

    run(middleware, req);
    expect(req.language).toBe('es');
  });

  it('honours custom supported languages and header name', () => {
    const custom = new LanguageResolutionMiddleware({
      supportedLanguages: ['pt-BR', 'fr'],
      defaultLanguage: 'pt-BR',
      headerName: 'x-locale',
    });
    const req = requestWith({ headers: { 'x-locale': 'pt-br' } });

    run(custom, req);
    expect(req.language).toBe('pt-BR');
  });

  it('handles array-valued headers', () => {
    const req = requestWith({ headers: { 'x-language': ['es', 'en'] } });

    run(middleware, req);
    expect(req.language).toBe('es');
  });
});

describe('language helpers', () => {
  it('matches exact tags before base languages', () => {
    expect(normaliseLanguage('pt-br', ['pt', 'pt-BR'])).toBe('pt-BR');
    expect(normaliseLanguage('en-GB', ['en', 'es'])).toBe('en');
    expect(normaliseLanguage('fr', ['en', 'es'])).toBeNull();
    expect(normaliseLanguage('', ['en'])).toBeNull();
  });

  it('ignores wildcards and q=0 entries', () => {
    expect(parseAcceptLanguage('*', ['en', 'es'])).toBeNull();
    expect(parseAcceptLanguage('es;q=0,en;q=0.1', ['en', 'es'])).toBe('en');
    expect(parseAcceptLanguage('', ['en'])).toBeNull();
  });

  it('handles malformed quality values without throwing', () => {
    // An unparsable q value keeps the RFC default of 1, so `es` still wins.
    expect(parseAcceptLanguage('es;q=abc,en;q=0.2', ['en', 'es'])).toBe('es');
  });
});
