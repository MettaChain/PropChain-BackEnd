import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma/prisma.service';
import { PaginationService } from '../common/pagination/pagination.service';
import { PaginationDto } from '../common/pagination/pagination.dto';

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paginationService: PaginationService,
  ) {}

  async findAll(paginationDto: PaginationDto) {
    const { page, limit, sort } = paginationDto;
    const skip = (page - 1) * limit;

    // Handle sorting, defaulting to newest first
    const [field, order] = sort?.split(':') || ['createdAt', 'desc'];

    // Execute queries in parallel for better performance
    const [data, total] = await Promise.all([
      this.prisma.transaction.findMany({
        skip,
        take: limit,
        orderBy: {
          [field]: order.toLowerCase() as 'asc' | 'desc',
        },
      }),
      this.prisma.transaction.count(),
    ]);

    return this.paginationService.paginate(data, total, paginationDto);
  }
}