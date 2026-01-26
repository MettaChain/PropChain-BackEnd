import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ErrorResponseDto } from './error.dto';
import { ErrorCode, ErrorMessages } from './error.codes';
import { v4 as uuidv4 } from 'uuid';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = request.headers['x-request-id'] as string || uuidv4();

    let errorResponse: ErrorResponseDto;

    if (exception instanceof HttpException) {
      errorResponse = this.handleHttpException(exception, request, requestId);
    } else {
      errorResponse = this.handleUnknownException(exception, request, requestId);
    }

    // Log the error
    this.logger.error(
      `Error occurred: ${errorResponse.errorCode} - ${errorResponse.message}`,
      {
        requestId,
        path: request.url,
        method: request.method,
        statusCode: errorResponse.statusCode,
        details: errorResponse.details,
        stack: exception instanceof Error ? exception.stack : undefined,
      },
    );

    response.status(errorResponse.statusCode).json(errorResponse);
  }

  private handleHttpException(
    exception: HttpException,
    request: Request,
    requestId: string,
  ): ErrorResponseDto {
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();
    
    let errorCode: ErrorCode;
    let message: string;
    let details: string[] | undefined;

    if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
      const responseObj = exceptionResponse as any;
      
      // Handle validation errors
      if (Array.isArray(responseObj.message)) {
        errorCode = ErrorCode.VALIDATION_ERROR;
        message = ErrorMessages[ErrorCode.VALIDATION_ERROR];
        details = responseObj.message;
      } else {
        errorCode = this.mapStatusToErrorCode(status);
        message = responseObj.message || ErrorMessages[errorCode];
        details = responseObj.details;
      }
    } else {
      errorCode = this.mapStatusToErrorCode(status);
      message = exceptionResponse.toString();
    }

    return new ErrorResponseDto({
      statusCode: status,
      errorCode,
      message,
      details,
      path: request.url,
      requestId,
    });
  }

  private handleUnknownException(
    exception: unknown,
    request: Request,
    requestId: string,
  ): ErrorResponseDto {
    const status = HttpStatus.INTERNAL_SERVER_ERROR;
    const errorCode = ErrorCode.INTERNAL_SERVER_ERROR;
    const message = ErrorMessages[errorCode];

    // In production, don't expose internal error details
    const details =
      process.env.NODE_ENV !== 'production' && exception instanceof Error
        ? [exception.message]
        : undefined;

    return new ErrorResponseDto({
      statusCode: status,
      errorCode,
      message,
      details,
      path: request.url,
      requestId,
    });
  }

  private mapStatusToErrorCode(status: HttpStatus): ErrorCode {
    const statusToErrorCode: Record<number, ErrorCode> = {
      [HttpStatus.BAD_REQUEST]: ErrorCode.VALIDATION_ERROR,
      [HttpStatus.UNAUTHORIZED]: ErrorCode.UNAUTHORIZED,
      [HttpStatus.FORBIDDEN]: ErrorCode.FORBIDDEN,
      [HttpStatus.NOT_FOUND]: ErrorCode.NOT_FOUND,
      [HttpStatus.CONFLICT]: ErrorCode.CONFLICT,
      [HttpStatus.INTERNAL_SERVER_ERROR]: ErrorCode.INTERNAL_SERVER_ERROR,
    };

    return statusToErrorCode[status] || ErrorCode.INTERNAL_SERVER_ERROR;
  }
}