import { ExceptionFilter, Catch, ArgumentsHost, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { I18nService, SupportedLanguage } from '../../i18n/i18n.service';

interface AuthenticatedUserShape {
  languagePreference?: string | null;
}

type LocalisedLabel = { status: HttpStatus; message: string; errors?: Record<string, string> };

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  constructor(private readonly i18n: I18nService) {}

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { user?: AuthenticatedUserShape }>();

    const language = this.resolveLanguage(request);
    const local = this.localise(exception, language);

    if (!local) {
      this.logger.error(`Unhandled Prisma error: ${exception.code}`, exception.stack);
    }

    this.logger.error(
      `Prisma Exception: ${exception.code} - ${local?.message ?? ''} - ${request.url} - Stack: ${exception.stack}`,
    );

    response.status(local?.status ?? HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      statusCode: local?.status ?? HttpStatus.INTERNAL_SERVER_ERROR,
      timestamp: new Date().toISOString(),
      path: request.url,
      language,
      message: local?.message ?? this.i18n.tFor('common.internal_server_error', language),
      errors: local?.errors,
      prismaCode: process.env.NODE_ENV === 'development' ? exception.code : undefined,
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

  private localise(
    exception: Prisma.PrismaClientKnownRequestError,
    language: SupportedLanguage,
  ): LocalisedLabel | null {
    switch (exception.code) {
      case 'P2002': {
        const target = (exception.meta?.target as string[] | undefined)?.join(', ') || 'field';
        return {
          status: HttpStatus.CONFLICT,
          message: this.i18n.tFor('prisma.P2002', language, { field: target }),
          errors: { [target]: this.i18n.tFor('users.email_taken', language) },
        };
      }
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          message: this.i18n.tFor('prisma.P2025', language),
        };
      case 'P2003':
        return {
          status: HttpStatus.BAD_REQUEST,
          message: this.i18n.tFor('prisma.P2003', language),
        };
      case 'P2014':
        return {
          status: HttpStatus.BAD_REQUEST,
          message: this.i18n.tFor('prisma.P2014', language),
        };
      case 'P2000':
        return {
          status: HttpStatus.BAD_REQUEST,
          message: this.i18n.tFor('prisma.P2000', language),
        };
      case 'P2011':
        return {
          status: HttpStatus.BAD_REQUEST,
          message: this.i18n.tFor('prisma.P2011', language),
        };
      default:
        return null;
    }
  }
}
