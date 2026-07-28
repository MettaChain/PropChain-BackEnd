import { ExceptionFilter, Catch, ArgumentsHost, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Database error occurred';
    let errors = null;

    // Handle common Prisma errors
    switch (exception.code) {
      case 'P2002': // Unique constraint violation
        status = HttpStatus.CONFLICT;
        const target = (exception.meta?.target as string[])?.join(', ') || 'field';
        message = `Unique constraint failed on ${target}`;
        errors = { [target]: 'must be unique' };
        break;
      case 'P2025': // Record not found
        status = HttpStatus.NOT_FOUND;
        message = 'Record not found';
        break;
      case 'P2003': // Foreign key constraint violation
        status = HttpStatus.BAD_REQUEST;
        message = 'Foreign key constraint failed - related record does not exist';
        break;
      case 'P2014': // Relation violation
        status = HttpStatus.BAD_REQUEST;
        message = 'Invalid relation - cannot change record due to existing dependencies';
        break;
      case 'P2000': // Value too long for column
        status = HttpStatus.BAD_REQUEST;
        message = 'Value too long for column';
        break;
      case 'P2011': // Null constraint violation
        status = HttpStatus.BAD_REQUEST;
        message = 'Null constraint violation - cannot set required field to null';
        break;
      default:
        this.logger.error(`Unhandled Prisma error: ${exception.code}`, exception.stack);
    }

    this.logger.error(
      `Prisma Exception: ${exception.code} - ${message} - ${request.url} - Stack: ${exception.stack}`,
    );

    response.status(status).json({
      success: false,
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message,
      errors,
      prismaCode: process.env.NODE_ENV === 'development' ? exception.code : undefined,
      stack: process.env.NODE_ENV === 'development' ? exception.stack : undefined,
    });
  }
}
