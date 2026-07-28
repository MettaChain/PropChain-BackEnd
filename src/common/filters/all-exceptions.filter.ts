import { ExceptionFilter, Catch, ArgumentsHost, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status = HttpStatus.INTERNAL_SERVER_ERROR;
    const message = exception instanceof Error ? exception.message : 'Internal server error';

    this.logger.error(
      `Uncaught Exception: ${message} - ${request.url}`,
      exception instanceof Error ? exception.stack : 'No stack trace available',
    );

    response.status(status).json({
      success: false,
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: process.env.NODE_ENV === 'production' ? 'Internal server error' : message,
      stack:
        process.env.NODE_ENV === 'development' && exception instanceof Error
          ? exception.stack
          : undefined,
    });
  }
}
