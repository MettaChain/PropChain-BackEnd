/**
 * Language resolution middleware (#1606).
 *
 * Resolves the preferred language for a request and exposes it as
 * `req.language`. Resolution order, highest priority first:
 *
 *   1. `X-Language` request header
 *   2. authenticated user preference (`authUser.languagePreference`)
 *   3. `Accept-Language` header (RFC 7231 quality values)
 *   4. the configured default (`en`)
 *
 * Every candidate is validated against the supported-language list; an
 * unsupported tag is skipped rather than rejected so a malformed header cannot
 * break a request.
 */

import { Inject, Injectable, NestMiddleware, Optional } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

export const DEFAULT_SUPPORTED_LANGUAGES: ReadonlyArray<string> = ['en', 'es'];
export const DEFAULT_LANGUAGE = 'en';
export const LANGUAGE_HEADER = 'x-language';
export const LANGUAGE_RESOLUTION_OPTIONS = Symbol('LANGUAGE_RESOLUTION_OPTIONS');

export interface LanguageResolutionOptions {
  supportedLanguages?: ReadonlyArray<string>;
  defaultLanguage?: string;
  headerName?: string;
}

export interface LanguageAwareRequest extends Request {
  authUser?: {
    languagePreference?: string | null;
    preferredLanguage?: string | null;
    language?: string | null;
  };
  language?: string;
}

interface LanguageEntry {
  tag: string;
  quality: number;
  index: number;
}

/**
 * Match a candidate tag against the supported list. Exact matches win over a
 * base-language match (`en-GB` resolves to `en` only when `en` is supported).
 */
export function normaliseLanguage(
  candidate: string | null | undefined,
  supported: ReadonlyArray<string>,
): string | null {
  if (!candidate) {
    return null;
  }
  const value = candidate.trim().toLowerCase();
  if (!value) {
    return null;
  }
  const exact = supported.find((language) => language.toLowerCase() === value);
  if (exact) {
    return exact;
  }
  const base = value.split('-')[0];
  if (!base) {
    return null;
  }
  return supported.find((language) => language.toLowerCase() === base) ?? null;
}

/**
 * Parse an `Accept-Language` header and return the best supported tag.
 * `q=0` entries and the `*` wildcard are ignored.
 */
export function parseAcceptLanguage(
  header: string | null | undefined,
  supported: ReadonlyArray<string>,
): string | null {
  if (!header) {
    return null;
  }
  const entries: LanguageEntry[] = [];
  let index = 0;
  for (const raw of header.split(',')) {
    const trimmed = raw.trim();
    if (!trimmed) {
      index += 1;
      continue;
    }
    const [tagPart, ...parameters] = trimmed.split(';');
    const tag = (tagPart ?? '').trim().toLowerCase();
    let quality = 1;
    for (const parameter of parameters) {
      const match = parameter.trim().match(/^q=([0-9.]+)$/i);
      if (match?.[1]) {
        const parsed = Number.parseFloat(match[1]);
        if (Number.isFinite(parsed)) {
          quality = parsed;
        }
      }
    }
    if (tag && tag !== '*' && quality > 0) {
      entries.push({ tag, quality, index });
    }
    index += 1;
  }

  entries.sort((a, b) => b.quality - a.quality || a.index - b.index);
  for (const entry of entries) {
    const resolved = normaliseLanguage(entry.tag, supported);
    if (resolved) {
      return resolved;
    }
  }
  return null;
}

@Injectable()
export class LanguageResolutionMiddleware implements NestMiddleware {
  private readonly supportedLanguages: ReadonlyArray<string>;
  private readonly defaultLanguage: string;
  private readonly headerName: string;

  constructor(
    @Optional()
    @Inject(LANGUAGE_RESOLUTION_OPTIONS)
    options?: LanguageResolutionOptions | null,
  ) {
    this.supportedLanguages =
      options?.supportedLanguages && options.supportedLanguages.length > 0
        ? options.supportedLanguages
        : DEFAULT_SUPPORTED_LANGUAGES;
    this.defaultLanguage =
      normaliseLanguage(options?.defaultLanguage, this.supportedLanguages) ??
      normaliseLanguage(DEFAULT_LANGUAGE, this.supportedLanguages) ??
      this.supportedLanguages[0] ??
      DEFAULT_LANGUAGE;
    this.headerName = (options?.headerName ?? LANGUAGE_HEADER).toLowerCase();
  }

  use(req: Request, _res: Response, next: NextFunction): void {
    const request = req as LanguageAwareRequest;
    const headerValue = request.headers[this.headerName];
    const fromHeader = normaliseLanguage(
      Array.isArray(headerValue) ? headerValue[0] : headerValue,
      this.supportedLanguages,
    );
    const fromUser = normaliseLanguage(
      request.authUser?.languagePreference ??
        request.authUser?.preferredLanguage ??
        request.authUser?.language,
      this.supportedLanguages,
    );
    const acceptLanguage = request.headers['accept-language'];
    const fromAccept = parseAcceptLanguage(
      Array.isArray(acceptLanguage) ? acceptLanguage[0] : acceptLanguage,
      this.supportedLanguages,
    );

    request.language = fromHeader ?? fromUser ?? fromAccept ?? this.defaultLanguage;
    next();
  }
}
