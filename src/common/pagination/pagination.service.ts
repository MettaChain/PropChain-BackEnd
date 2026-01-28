import { Injectable } from '@nestjs/common';
import { PaginationMeta, PaginationDto, PaginatedResponse } from './pagination.dto';

@Injectable()
export class PaginationService {
  /**
   * Calculate skip value for database queries
   */
  getSkip(page: number, limit: number): number {
    return (page - 1) * limit;
  }

  /**
   * Calculate pagination metadata
   */
  createMeta(total: number, page: number, limit: number): PaginationMeta {
    const pages = Math.ceil(total / limit);

    return {
      total,
      page,
      limit,
      pages: pages > 0 ? pages : 1,
      hasNext: page < pages,
      hasPrev: page > 1,
    };
  }

  /**
   * Create paginated response with data and metadata
   */
  createResponse<T>(data: T[], total: number, paginationDto: PaginationDto): PaginatedResponse<T> {
    const { page = 1, limit = 10 } = paginationDto;

    return {
      data,
      meta: this.createMeta(total, page, limit),
    };
  }

  /**
   * Sanitize sort field to prevent SQL injection
   * Only allows alphanumeric characters, underscores, and dots
   */
  sanitizeSortField(field: string): string {
    if (!field) {
      return '';
    }

    // Remove any characters that aren't alphanumeric, underscore, or dot
    const sanitized = field.replace(/[^a-zA-Z0-9_.]/g, '');

    return sanitized;
  }

  /**
   * Validate if requested page exists
   */
  validatePage(page: number, total: number, limit: number): boolean {
    const totalPages = Math.ceil(total / limit);

    if (total === 0) {
      return page === 1;
    }

    return page >= 1 && page <= totalPages;
  }
}
