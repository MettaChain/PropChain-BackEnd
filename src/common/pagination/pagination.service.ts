import { Injectable } from '@nestjs/common';
import { PaginationDto } from './pagination.dto';

@Injectable()
export class PaginationService {
  /**
   * Standardizes the list response with data and pagination metadata.
   * Takes the raw data array, the total count from the DB, and the request DTO.
   */
  paginate<T>(data: T[], total: number, paginationDto: PaginationDto) {
    const page = paginationDto.page || 1;
    const limit = paginationDto.limit || 10;
    const totalPages = Math.ceil(total / limit);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Helper to parse a sort string (e.g., "price:desc") into a Prisma-compatible orderBy object.
   * Defaults to { createdAt: 'desc' } if no sort string is provided.
   */
  parseSort(sort?: string): Record<string, 'asc' | 'desc'> {
    if (!sort) {
      return { createdAt: 'desc' };
    }

    const [field, order] = sort.split(':');
    const direction = order?.toLowerCase() === 'asc' ? 'asc' : 'desc';

    return { [field]: direction };
  }
}