import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { I18nService, SupportedLanguage } from '../../i18n/i18n.service';

interface StandardizedValidationError {
  field: string;
  message: string;
  code: string;
  constraints?: Record<string, string>;
}

interface AuthenticatedUserShape {
  languagePreference?: string | null;
}

/**
 * Catches `BadRequestException` (HTTP 400) errors and transforms them into a
 * standardized validation error format:
 *
 * ```json
 * {
 *   "success": false,
 *   "statusCode": 400,
 *   "timestamp": "2026-07-28T12:00:00.000Z",
 *   "path": "/api/v1/auth/register",
 *   "errors": [
 *     { "field": "email", "message": "email must be a valid email", "code": "IS_EMAIL", "constraints": { "isEmail": "email must be a valid email" } }
 *   ]
 * }
 * ```
 *
 * @see https://github.com/MettaChain/PropChain-BackEnd/issues/967
 */
@Catch(BadRequestException)
export class ValidationExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ValidationExceptionFilter.name);

  constructor(private readonly i18n: I18nService) {}

  catch(exception: BadRequestException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { user?: AuthenticatedUserShape }>();

    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();
    const language = this.resolveLanguage(request);

    // Determine whether this is a validation error (thrown by ValidationPipe)
    // or a regular BadRequestException with a string message.
    if (this.isValidationErrorResponse(exceptionResponse)) {
      const rawErrors = (exceptionResponse as { message: string[] }).message;
      const standardized = this.standardize(rawErrors, language);

      response.status(status).json({
        success: false,
        statusCode: status,
        timestamp: new Date().toISOString(),
        path: request.url,
        language,
        errors: standardized,
      });
    } else {
      // For non-validation BadRequestExceptions, delegate to the standard format
      // but still use a consistent shape.
      const message =
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : (exceptionResponse as { message?: string }).message ?? 'Bad Request';

      response.status(status).json({
        success: false,
        statusCode: status,
        timestamp: new Date().toISOString(),
        path: request.url,
        language,
        message: this.translateIfI18nKey(message, language),
      });
    }
  }

  /**
   * Transforms class-validator constraint messages into a standardized array.
   *
   * Each entry maps to `{ field, message, code, constraints }`.
   * Field names remain camelCase by default (class-validator uses the DTO property name).
   */
  private standardize(
    rawMessages: string[],
    language: SupportedLanguage,
  ): StandardizedValidationError[] {
    return rawMessages.map((raw) => {
      const parsed = this.parseValidationMessage(raw);
      return {
        field: parsed.field,
        message: this.translateIfI18nKey(parsed.message, language),
        code: parsed.code,
        constraints: parsed.constraints,
      };
    });
  }

  /**
   * Attempts to extract `field`, `code`, and `message` from a class-validator
   * constraint string.
   *
   * Examples:
   *   "email must be a valid email" → { field: "email", code: "IS_EMAIL", message: "email must be a valid email" }
   *   "password must be longer than or equal to 8 characters" → { field: "password", code: "MIN_LENGTH", message: "..." }
   */
  private parseValidationMessage(raw: string): {
    field: string;
    code: string;
    message: string;
    constraints?: Record<string, string>;
  } {
    const parts = raw.split(' ');
    const field = parts[0] ?? 'unknown';

    // Heuristic: derive a code from the message pattern
    const code = this.inferCode(raw);

    return {
      field,
      code,
      message: raw,
      constraints: { [code.toLowerCase()]: raw },
    };
  }

  /**
   * Infers a validation error code from a class-validator constraint message.
   */
  private inferCode(message: string): string {
    const lower = message.toLowerCase();
    if (lower.includes('must be a valid email') || lower.includes('must be an email'))
      return 'IS_EMAIL';
    if (lower.includes('must be longer') || lower.includes('must be at least'))
      return 'MIN_LENGTH';
    if (lower.includes('must be shorter') || lower.includes('must be at most'))
      return 'MAX_LENGTH';
    if (lower.includes('should not be empty') || lower.includes('must not be empty'))
      return 'IS_NOT_EMPTY';
    if (lower.includes('must be a string')) return 'IS_STRING';
    if (lower.includes('must be a number')) return 'IS_NUMBER';
    if (lower.includes('must be a boolean')) return 'IS_BOOLEAN';
    if (lower.includes('must be an array')) return 'IS_ARRAY';
    if (lower.includes('must be an object')) return 'IS_OBJECT';
    if (lower.includes('must be a date')) return 'IS_DATE';
    if (lower.includes('must be a valid uuid')) return 'IS_UUID';
    if (lower.includes('must be a valid url')) return 'IS_URL';
    if (lower.includes('must match')) return 'MATCHES';
    if (lower.includes('must be one of')) return 'IS_IN';
    if (lower.includes('must be a valid enum')) return 'IS_ENUM';
    if (lower.includes('must be a positive')) return 'IS_POSITIVE';
    if (lower.includes('must be a negative')) return 'IS_NEGATIVE';
    if (lower.includes('must be an integer')) return 'IS_INT';
    if (lower.includes('must be less than') || lower.includes('must be smaller')) return 'MAX';
    if (lower.includes('must be greater than') || lower.includes('must be larger')) return 'MIN';
    if (lower.includes('must contain')) return 'CONTAINS';
    if (lower.includes('must not contain')) return 'NOT_CONTAINS';
    if (lower.includes('must be defined')) return 'IS_DEFINED';
    if (lower.includes('should not exist') || lower.includes('must not exist'))
      return 'NOT_EXISTS';
    if (lower.includes('must be a valid phone')) return 'IS_PHONE_NUMBER';
    if (lower.includes('must be a valid postal')) return 'IS_POSTAL_CODE';
    if (lower.includes('must be a valid credit card')) return 'IS_CREDIT_CARD';
    if (lower.includes('must be a valid hex color')) return 'IS_HEX_COLOR';
    if (lower.includes('must be a valid ip')) return 'IS_IP';
    if (lower.includes('must be a valid json')) return 'IS_JSON';
    if (lower.includes('must be a valid jwt')) return 'IS_JWT';
    if (lower.includes('must be a valid locale')) return 'IS_LOCALE';
    if (lower.includes('must be lowercase')) return 'IS_LOWERCASE';
    if (lower.includes('must be uppercase')) return 'IS_UPPERCASE';
    if (lower.includes('must be a valid mime type')) return 'IS_MIME_TYPE';
    if (lower.includes('must be alphanumeric')) return 'IS_ALPHANUMERIC';
    if (lower.includes('must be alpha')) return 'IS_ALPHA';
    if (lower.includes('must be a valid base64')) return 'IS_BASE64';

    return 'VALIDATION_ERROR';
  }

  private isValidationErrorResponse(
    exceptionResponse: string | object,
  ): exceptionResponse is { message: string[] } {
    return (
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null &&
      'message' in exceptionResponse &&
      Array.isArray((exceptionResponse as { message: unknown }).message)
    );
  }

  private translateIfI18nKey(text: string, language: SupportedLanguage): string {
    if (/^[a-z]+(\.[a-z_]+)+$/i.test(text) && text !== language) {
      const resolved = this.i18n.tFor(text, language);
      if (resolved !== text) return resolved;
    }
    return text;
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
