import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_RESOLUTION_OPTIONS,
  LanguageResolutionMiddleware,
} from './language-resolution.middleware';

/**
 * Registers the language resolution middleware for extension routes (#1606).
 *
 * `SUPPORTED_LANGUAGES` (comma-separated) and `DEFAULT_LANGUAGE` tune the
 * accepted values; the defaults mirror `src/i18n/i18n.service.ts`.
 */
@Module({
  providers: [
    LanguageResolutionMiddleware,
    {
      provide: LANGUAGE_RESOLUTION_OPTIONS,
      useValue: {
        supportedLanguages: (process.env.SUPPORTED_LANGUAGES ?? '')
          .split(',')
          .map((language) => language.trim())
          .filter(Boolean),
        defaultLanguage: process.env.DEFAULT_LANGUAGE ?? DEFAULT_LANGUAGE,
      },
    },
  ],
  exports: [LanguageResolutionMiddleware],
})
export class LanguageResolutionModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(LanguageResolutionMiddleware)
      .forRoutes({ path: 'api/extensions/*', method: RequestMethod.ALL });
  }
}
