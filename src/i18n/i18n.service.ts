// @ts-nocheck

import { Injectable } from '@nestjs/common';
import { SupportedLanguage, translations } from './translations';

@Injectable()
export class I18nService {
  private readonly defaultLanguage: SupportedLanguage = 'en';

  translate(key: string, language?: string | null, params?: Record<string, string | number>): string {
    const lang = this.resolveLanguage(language);
    let text = translations[lang]?.[key] || translations[this.defaultLanguage]?.[key] || key;

    if (params) {
      for (const [paramKey, paramValue] of Object.entries(params)) {
        text = text.replace(new RegExp(`{{${paramKey}}}`, 'g'), String(paramValue));
      }
    }

    return text;
  }

  translateTemplate(key: string, language?: string | null, params?: Record<string, string | number>): {
    subject: string;
    body: string;
  } {
    const subjectKey = `${key}.subject`;
    const bodyKey = `${key}.body`;

    const subject = this.translate(subjectKey, language, params);
    const body = this.translate(bodyKey, language, params);

    return { subject, body };
  }

  private resolveLanguage(language?: string | null): SupportedLanguage {
    if (language && (language === 'en' || language === 'es')) {
      return language;
    }
    return this.defaultLanguage;
  }

  getSupportedLanguages(): SupportedLanguage[] {
    return ['en', 'es'];
  }
}
