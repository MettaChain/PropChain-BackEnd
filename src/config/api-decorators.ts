/**
 * API Documentation Decorators
 * Decorators for enriching OpenAPI documentation
 */

import { applyDecorators } from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
  ApiHeader,
  ApiSecurity,
} from '@nestjs/swagger';

/**
 * Decorator for public endpoints (no authentication required)
 */
export function ApiPublicEndpoint(summary: string, description: string) {
  return applyDecorators(
    ApiOperation({
      summary,
      description,
    }),
    ApiResponse({
      status: 200,
      description: 'Success',
    }),
    ApiResponse({
      status: 400,
      description: 'Bad Request',
    }),
    ApiResponse({
      status: 500,
      description: 'Internal Server Error',
    }),
  );
}

/**
 * Decorator for protected endpoints (authentication required)
 */
export function ApiProtectedEndpoint(summary: string, description: string) {
  return applyDecorators(
    ApiBearerAuth('access-token'),
    ApiOperation({
      summary,
      description,
    }),
    ApiHeader({
      name: 'API-Version',
      description: 'API Version (v1 or v2)',
      required: false,
      example: 'v2',
    }),
    ApiResponse({
      status: 200,
      description: 'Success',
    }),
    ApiResponse({
      status: 400,
      description: 'Bad Request',
    }),
    ApiResponse({
      status: 401,
      description: 'Unauthorized',
    }),
    ApiResponse({
      status: 403,
      description: 'Forbidden',
    }),
    ApiResponse({
      status: 500,
      description: 'Internal Server Error',
    }),
  );
}

/**
 * Decorator for admin-only endpoints
 */
export function ApiAdminEndpoint(summary: string, description: string) {
  return applyDecorators(
    ApiBearerAuth('access-token'),
    ApiOperation({
      summary,
      description,
      tags: ['Admin'],
    }),
    ApiResponse({
      status: 200,
      description: 'Success',
    }),
    ApiResponse({
      status: 401,
      description: 'Unauthorized',
    }),
    ApiResponse({
      status: 403,
      description: 'Forbidden - Admin access required',
    }),
  );
}

/**
 * Decorator for paginated list endpoints
 */
export function ApiPaginatedEndpoint(summary: string, description: string) {
  return applyDecorators(
    ApiOperation({
      summary,
      description,
    }),
    ApiQuery({
      name: 'page',
      description: 'Page number',
      required: false,
      example: 1,
      type: Number,
    }),
    ApiQuery({
      name: 'limit',
      description: 'Items per page',
      required: false,
      example: 10,
      type: Number,
    }),
    ApiQuery({
      name: 'sortBy',
      description: 'Field to sort by',
      required: false,
      example: 'createdAt',
      type: String,
    }),
    ApiQuery({
      name: 'order',
      description: 'Sort order (asc/desc)',
      required: false,
      example: 'desc',
      type: String,
    }),
    ApiResponse({
      status: 200,
      description: 'List of items with pagination info',
    }),
  );
}

/**
 * Decorator for endpoints with path parameters
 */
export function ApiWithPathParam(paramName: string, paramType: 'string' | 'number' = 'string') {
  return ApiParam({
    name: paramName,
    description: `The ${paramName} identifier`,
    type: paramType,
    example: paramType === 'number' ? 1 : 'uuid-or-id',
  });
}

/**
 * Decorator for deprecated endpoints
 */
export function ApiDeprecatedEndpoint(
  summary: string,
  description: string,
  alternativeEndpoint: string,
) {
  return applyDecorators(
    ApiOperation({
      summary: `[DEPRECATED] ${summary}`,
      description: `${description}\n\n⚠️ This endpoint is deprecated. Use ${alternativeEndpoint} instead.`,
      deprecated: true,
    }),
    ApiResponse({
      status: 200,
      description: 'Success (but endpoint is deprecated)',
      headers: {
        Deprecation: {
          description: 'Deprecation flag',
        },
        Sunset: {
          description: 'Sunset date',
        },
      },
    }),
  );
}

/**
 * Decorator for versioned endpoints
 */
export function ApiVersionedEndpoint(
  summary: string,
  description: string,
  supportedVersions: string[],
) {
  return applyDecorators(
    ApiOperation({
      summary,
      description: `${description}\n\nSupported versions: ${supportedVersions.join(', ')}`,
    }),
    ApiHeader({
      name: 'API-Version',
      description: `Required version. Supported: ${supportedVersions.join(', ')}`,
      required: false,
      example: supportedVersions[0],
    }),
  );
}

/**
 * Decorator for endpoints with rate limiting
 */
export function ApiRateLimited(limit: number, window: string) {
  return ApiResponse({
    status: 429,
    description: `Rate limited: ${limit} requests per ${window}`,
  });
}

/**
 * Decorator for search/filter endpoints
 */
export function ApiSearchEndpoint(summary: string, description: string) {
  return applyDecorators(
    ApiOperation({
      summary,
      description,
    }),
    ApiQuery({
      name: 'q',
      description: 'Search query',
      required: false,
      type: String,
    }),
    ApiQuery({
      name: 'filters',
      description: 'Additional filters as JSON',
      required: false,
      type: String,
    }),
  );
}
