/**
 * Cache Operation Result Types
 * Provides typed results to distinguish between success, failure, and empty states
 */

export enum CacheOperationStatus {
  SUCCESS = 'success',
  MISS = 'miss',
  ERROR = 'error',
}

export interface CacheResult<T> {
  status: CacheOperationStatus;
  data?: T;
  error?: string;
  timestamp: Date;
}

export interface CacheOperationResult {
  status: CacheOperationStatus;
  error?: string;
  timestamp: Date;
}

/**
 * Create a successful cache result
 */
export function createSuccessResult<T>(data: T): CacheResult<T> {
  return {
    status: CacheOperationStatus.SUCCESS,
    data,
    timestamp: new Date(),
  };
}

/**
 * Create a cache miss result
 */
export function createMissResult<T>(): CacheResult<T> {
  return {
    status: CacheOperationStatus.MISS,
    timestamp: new Date(),
  };
}

/**
 * Create a cache error result
 */
export function createErrorResult<T>(error: string): CacheResult<T> {
  return {
    status: CacheOperationStatus.ERROR,
    error,
    timestamp: new Date(),
  };
}

/**
 * Create a successful operation result (for set/del/clear)
 */
export function createOperationSuccessResult(): CacheOperationResult {
  return {
    status: CacheOperationStatus.SUCCESS,
    timestamp: new Date(),
  };
}

/**
 * Create an operation error result (for set/del/clear)
 */
export function createOperationErrorResult(error: string): CacheOperationResult {
  return {
    status: CacheOperationStatus.ERROR,
    error,
    timestamp: new Date(),
  };
}
