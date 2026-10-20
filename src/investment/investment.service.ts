import { Injectable } from '@nestjs/common';

export interface Investment {
  id: number;
  property: string;
  amount: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Minimal in-memory Investment API. The seed array stands in for a
 * persistence layer; the purpose of this module is the pagination contract.
 */
@Injectable()
export class InvestmentService {
  private readonly investments: Investment[] = Array.from(
    { length: 57 },
    (_, index) => ({
      id: index + 1,
      property: `Property ${index + 1}`,
      amount: (index + 1) * 1000,
    }),
  );

  findAll(page = 1, limit = 20): PaginatedResult<Investment> {
    const safePage = Math.max(1, Math.floor(page));
    const safeLimit = Math.max(1, Math.floor(limit));
    const start = (safePage - 1) * safeLimit;
    const data = this.investments.slice(start, start + safeLimit);

    return {
      data,
      total: this.investments.length,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(this.investments.length / safeLimit),
    };
  }
}
