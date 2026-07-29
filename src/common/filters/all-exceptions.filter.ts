import { ExceptionFilter, Catch, ArgumentsHost, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { I18nService, SupportedLanguage } from '../../i18n/i18n.service';

interface AuthenticatedUserShape {
  languagePreference?: string | null;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly i18n: I18nService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { user?: AuthenticatedUserShape }>();

    const language = this.resolveLanguage(request);
    const fallback = this.i18n.tFor('common.unexpected_error', language);
    const message =
      exception instanceof Error
        ? exception.message || fallback
        : this.i18n.tFor('common.internal_server_error', language);

    const safeMessage =
      process.env.NODE_ENV === 'production' && !(exception instanceof Error) ? fallback : message;

    this.logger.error(
      `Uncaught Exception: ${safeMessage} - ${request.url}`,
      exception instanceof Error ? exception.stack : 'No stack trace available',
    );

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      timestamp: new Date().toISOString(),
      path: request.url,
      language,
      message: safeMessage,
      stack:
        process.env.NODE_ENV === 'development' && exception instanceof Error
          ? exception.stack
          : undefined,
    });
  }

  private resolveLanguage(request: Request & { user?: AuthenticatedUserShape }): SupportedLanguage {
    const explicitOverride =
      typeof request.headers['x-language'] === 'string'
        ? (request.headers['x-language'] as string)
        : undefined;
    const fromHeader =
      typeof request.headers['accept-language'] === 'string'
        ? (request.headers['accept-language'] as string)
        : undefined;
    return this.i18n.resolveLanguage({
      userPreference: request.user?.languagePreference ?? explicitOverride ?? null,
      acceptLanguageHeader: fromHeader,
    });
  }
}
