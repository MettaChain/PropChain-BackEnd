import { ExceptionFilter, Catch, ArgumentsHost, HttpException, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { I18nService, SupportedLanguage } from '../../i18n/i18n.service';

type ExceptionResponseObject = {
  message?: string | string[];
  error?: string;
  errors?: Record<string, unknown> | unknown[];
};

interface AuthenticatedUserShape {
  languagePreference?: string | null;
}

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  constructor(private readonly i18n: I18nService) {}

  catch(exception: HttpException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { user?: AuthenticatedUserShape }>();

    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    const language = this.resolveLanguage(request);
    const fallbackMessage = this.i18n.tFor(`http.${status}`, language);
    const { message, errors } = this.extract(exceptionResponse, fallbackMessage, language);

    this.logger.error(
      `HTTP Exception: ${status} - ${message} - ${request.url} - Stack: ${exception.stack}`,
    );

    response.status(status).json({
      success: false,
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      language,
      message,
      errors,
      stack: process.env.NODE_ENV === 'development' ? exception.stack : undefined,
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

  private extract(
    exceptionResponse: string | ExceptionResponseObject,
    fallback: string,
    language: SupportedLanguage,
  ): { message: string; errors: ExceptionResponseObject['errors'] } {
    if (typeof exceptionResponse === 'string') {
      return { message: this.translateLabel(exceptionResponse, language), errors: undefined };
    }

    const rawMessage = exceptionResponse.message ?? fallback;
    const errors = exceptionResponse.errors;

    let translated: string;
    if (Array.isArray(rawMessage)) {
      translated = rawMessage
        .map((entry) => this.translateLabel(String(entry), language))
        .join('; ');
    } else {
      translated = this.translateLabel(String(rawMessage), language);
    }

    return { message: translated, errors };
  }

  private translateLabel(label: string, language: SupportedLanguage): string {
    if (/^[a-z]+(\.[a-z_]+)+$/i.test(label) && label !== language) {
      const resolved = this.i18n.tFor(label, language);
      if (resolved !== label) {
        return resolved;
      }
    }
    return label;
  }
}
