// @ts-nocheck

/**
 * Response Format Interceptor
 * Standardizes all API responses into a consistent envelope format
 *
 * Success response format: { success: true, data, meta, timestamp }
 * Error response format: { success: false, message, errors, timestamp }
 * Pagination meta format: { page, limit, total, totalPages }
 */

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpException,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { Response } from 'express';

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface SuccessResponse<T> {
  success: true;
  data: T;
  meta?: PaginationMeta | Record<string, any>;
  timestamp: string;
}

interface ErrorResponse {
  success: false;
  message: string;
  errors?: any[];
  timestamp: string;
}

@Injectable()
export class ResponseFormatInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const timestamp = new Date().toISOString();
    const ctx = context.switchToHttp();
    const response = ctx.getResponse<Response>();

    return next.handle().pipe(
      map((data) => {
        // If data already has our standard format, return it as-is
        if (data && typeof data === 'object' && 'success' in data) {
          return data;
        }

        // Handle paginated responses that already have { data, meta } structure
        if (data && typeof data === 'object' && 'data' in data && 'meta' in data) {
          const { data: responseData, meta } = data;
          return {
            success: true,
            data: responseData,
            meta: this.validatePaginationMeta(meta),
            timestamp,
          } as SuccessResponse<any>;
        }

        // Handle standard raw responses
        return {
          success: true,
          data,
          timestamp,
        } as SuccessResponse<any>;
      }),
      catchError((error) => {
        let statusCode = 500;
        let message = 'Internal Server Error';
        let errors: any[] | undefined;

        if (error instanceof HttpException) {
          statusCode = error.getStatus();
          const errorResponse = error.getResponse();

          if (typeof errorResponse === 'string') {
            message = errorResponse;
          } else if (typeof errorResponse === 'object') {
            message = (errorResponse as any).message || message;
            errors = (errorResponse as any).errors;
          }
        } else if (error instanceof Error) {
          message = error.message;
        }

        response.status(statusCode);

        const errorResponse: ErrorResponse = {
          success: false,
          message,
          timestamp,
        };

        if (errors) {
          errorResponse.errors = errors;
        }

        return throwError(() => ({
          ...errorResponse,
          statusCode,
        }));
      }),
    );
  }

  private validatePaginationMeta(meta: any): PaginationMeta | Record<string, any> {
    // Check if it has pagination properties
    const hasPaginationProps =
      'page' in meta || 'limit' in meta || 'total' in meta || 'totalPages' in meta;

    if (hasPaginationProps) {
      return {
        page: meta.page || 1,
        limit: meta.limit || 10,
        total: meta.total || 0,
        totalPages: meta.totalPages || Math.ceil((meta.total || 0) / (meta.limit || 10)),
      } as PaginationMeta;
    }

    // Return as-is if it's just regular meta
    return meta;
  }
}
