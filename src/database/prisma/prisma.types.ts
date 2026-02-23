// Prisma type enhancement and utility functions

import { Prisma } from '@prisma/client';

// Enhanced Prisma client types with better type safety
export type PrismaModelNames = Prisma.ModelName;

// Type-safe query builders
export type PrismaSelect<T> = T extends Prisma.ModelName
  ? Prisma.TypeMap['model'][T]['findUnique']['args']['select']
  : never;

export type PrismaInclude<T> = T extends Prisma.ModelName
  ? Prisma.TypeMap['model'][T]['findUnique']['args']['include']
  : never;

export type PrismaWhere<T> = T extends Prisma.ModelName
  ? Prisma.TypeMap['model'][T]['findUnique']['args']['where']
  : never;

// Utility types for common Prisma operations
export type PrismaTransaction = Prisma.TransactionClient;

export interface PrismaQueryOptions {
  skip?: number;
  take?: number;
  cursor?: Prisma.PropertyWhereUniqueInput;
  where?: Prisma.PropertyWhereInput;
  orderBy?: Prisma.PropertyOrderByWithRelationInput | Prisma.PropertyOrderByWithRelationInput[];
  select?: Prisma.PropertySelect;
  include?: Prisma.PropertyInclude;
}

export interface PrismaPaginatedResult<T> {
  data: T[];
  totalCount: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  currentPage: number;
  totalPages: number;
}

// Type-safe Prisma query builder helpers
export class PrismaQueryBuilder {
  static buildPaginationQuery<T>(
    modelName: Prisma.ModelName,
    options: {
      page?: number;
      limit?: number;
      where?: any;
      orderBy?: any;
      select?: any;
      include?: any;
    },
  ): { findMany: any; count: any } {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 20));
    const skip = (page - 1) * limit;

    return {
      findMany: {
        skip,
        take: limit,
        where: options.where,
        orderBy: options.orderBy,
        select: options.select,
        include: options.include,
      },
      count: {
        where: options.where,
      },
    };
  }

  static async paginate<T>(
    prisma: any,
    modelName: string,
    queryOptions: PrismaQueryOptions,
    page: number = 1,
    limit: number = 20,
  ): Promise<PrismaPaginatedResult<T>> {
    const skip = (page - 1) * limit;

    const [data, totalCount] = await Promise.all([
      prisma[modelName].findMany({
        ...queryOptions,
        skip,
        take: limit,
      }),
      prisma[modelName].count({
        where: queryOptions.where,
      }),
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    return {
      data,
      totalCount,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
      currentPage: page,
      totalPages,
    };
  }
}

// Type-safe relationship helpers
export type PrismaWithRelations<T, R extends string> = T & {
  [K in R]: K extends keyof T ? T[K] : never;
};

// Type-safe enum helpers
export const PrismaEnums = {
  PropertyStatus: Prisma.PropertyStatus,
  UserRole: Prisma.UserRole,
  TransactionStatus: Prisma.TransactionStatus,
  TransactionType: Prisma.TransactionType,
  DocumentType: Prisma.DocumentType,
  DocumentStatus: Prisma.DocumentStatus,
} as const;

// Type-safe enum validation
export function isValidPrismaEnum<T extends Record<string, string>>(enumObj: T, value: string): value is T[keyof T] {
  return Object.values(enumObj).includes(value as T[keyof T]);
}

// Prisma error handling utilities
export interface PrismaError {
  code: string;
  message: string;
  meta?: Record<string, any>;
}

export class PrismaErrorHandler {
  static handlePrismaError(error: any): PrismaError {
    if (error instanceof Error && 'code' in error) {
      const prismaError = error as any;
      return {
        code: prismaError.code,
        message: prismaError.message,
        meta: prismaError.meta,
      };
    }

    return {
      code: 'UNKNOWN_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }

  static isUniqueConstraintError(error: any): boolean {
    return error?.code === 'P2002';
  }

  static isForeignKeyConstraintError(error: any): boolean {
    return error?.code === 'P2003';
  }

  static isRecordNotFoundError(error: any): boolean {
    return error?.code === 'P2025';
  }
}

// Type-safe Prisma transaction helpers
export async function withPrismaTransaction<T>(
  prisma: any,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  try {
    return await prisma.$transaction(operation);
  } catch (error) {
    const prismaError = PrismaErrorHandler.handlePrismaError(error);
    throw new Error(`Prisma transaction failed: ${prismaError.message}`);
  }
}

// Type-safe bulk operations
export interface BulkOperationOptions {
  batchSize?: number;
  parallel?: boolean;
  retryCount?: number;
}

export class PrismaBulkOperations {
  static async createMany<T>(
    prisma: any,
    modelName: string,
    data: T[],
    options: BulkOperationOptions = {},
  ): Promise<T[]> {
    const batchSize = options.batchSize || 1000;
    const results: T[] = [];

    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);
      const batchResults = await prisma[modelName].createMany({
        data: batch,
        skipDuplicates: true,
      });
      results.push(...batchResults);
    }

    return results;
  }

  static async updateMany<T>(
    prisma: any,
    modelName: string,
    where: any,
    data: Partial<T>,
    options: BulkOperationOptions = {},
  ): Promise<number> {
    const result = await prisma[modelName].updateMany({
      where,
      data,
    });
    return result.count;
  }

  static async deleteMany(
    prisma: any,
    modelName: string,
    where: any,
    options: BulkOperationOptions = {},
  ): Promise<number> {
    const result = await prisma[modelName].deleteMany({
      where,
    });
    return result.count;
  }
}
