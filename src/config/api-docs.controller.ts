/**
 * API Documentation Controller
 * Provides access to OpenAPI spec and API information
 */

import { Controller, Get, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Response } from 'express';
import { ApiVersionEnum, API_VERSIONS } from '../versioning/api-version.constants';

@ApiExcludeController()
@Controller('api')
export class ApiDocsController {
  /**
   * Get OpenAPI specification in JSON format
   */
  @Get('openapi.json')
  getOpenApiSpec(@Res() res: Response) {
    // This will be populated by setupSwagger
    const spec = (res.req.app as any).openAPIDocument;

    if (spec) {
      res.json(spec);
    } else {
      res.status(404).json({
        error: 'OpenAPI specification not found',
      });
    }
  }

  /**
   * Get API information and available versions
   */
  @Get('info')
  getApiInfo() {
    return {
      name: 'PropChain API',
      version: '2.0.0',
      description: 'Blockchain-Powered Real Estate Platform',
      author: 'PropChain Team',
      license: 'MIT',
      documentation: 'https://api.propchain.io/api/docs',
      openAPISpec: 'https://api.propchain.io/api/openapi.json',
      supportedVersions: Object.entries(API_VERSIONS).map(([key, value]) => ({
        version: key,
        status: value.status,
        released: value.released,
        sunsetDate: value.sunsetDate,
        documentation: value.documentation,
      })),
    };
  }

  /**
   * Get changelog for all API versions
   */
  @Get('changelog')
  getChangelog() {
    return {
      versions: [
        {
          version: 'v2',
          released: '2026-04-01',
          status: 'active',
          features: [
            'Enhanced user profiles with verification documents',
            'Trust score system for reputation management',
            'Session management and security improvements',
            'API versioning and backward compatibility',
            'User preferences and customization',
            'Soft delete support for data retention',
            'Rate limiting and security headers',
            'Enhanced property search and filters',
          ],
          improvements: [
            'Improved response times with indexed queries',
            'Better error messages and validation',
            'Enhanced security with JWT tokens',
            'Support for multiple authentication methods',
          ],
          breaking_changes: ['Some fields now require explicit version headers'],
        },
        {
          version: 'v1',
          released: '2026-01-01',
          status: 'deprecated',
          sunsetDate: '2026-12-31',
          features: [
            'User authentication and authorization',
            'Basic user management',
            'Property listing and search',
            'Dashboard with analytics',
            'Email verification',
          ],
          notes: 'Deprecated. Please migrate to v2. Support ends 2026-12-31.',
        },
      ],
    };
  }

  /**
   * Get API health and status
   */
  @Get('health')
  getHealth() {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '2.0.0',
      environment: process.env.NODE_ENV || 'development',
    };
  }

  /**
   * Get available endpoints grouped by category
   */
  @Get('endpoints')
  getEndpoints() {
    return {
      categories: {
        authentication: {
          description: 'User authentication and authorization',
          endpoints: [
            {
              method: 'POST',
              path: '/auth/register',
              description: 'Register a new user',
            },
            {
              method: 'POST',
              path: '/auth/login',
              description: 'Login user',
            },
            {
              method: 'POST',
              path: '/auth/logout',
              description: 'Logout user',
            },
            {
              method: 'POST',
              path: '/auth/refresh',
              description: 'Refresh access token',
            },
          ],
        },
        users: {
          description: 'User management and profiles',
          endpoints: [
            {
              method: 'GET',
              path: '/users',
              description: 'List all users',
            },
            {
              method: 'GET',
              path: '/users/:id',
              description: 'Get user by ID',
            },
            {
              method: 'PUT',
              path: '/users/:id',
              description: 'Update user',
            },
            {
              method: 'DELETE',
              path: '/users/:id',
              description: 'Delete user',
            },
          ],
        },
        properties: {
          description: 'Property management and search',
          endpoints: [
            {
              method: 'GET',
              path: '/properties',
              description: 'List properties',
            },
            {
              method: 'GET',
              path: '/properties/:id',
              description: 'Get property by ID',
            },
            {
              method: 'POST',
              path: '/properties',
              description: 'Create new property',
            },
            {
              method: 'PUT',
              path: '/properties/:id',
              description: 'Update property',
            },
          ],
        },
        versioning: {
          description: 'API versioning information',
          endpoints: [
            {
              method: 'GET',
              path: '/version',
              description: 'Get current API version info',
            },
          ],
        },
      },
    };
  }

  /**
   * Get code examples for common tasks
   */
  @Get('examples')
  getCodeExamples() {
    return {
      authentication: {
        description: 'Authentication examples',
        examples: [
          {
            title: 'Register a new user',
            method: 'POST',
            url: '/api/auth/register',
            headers: {
              'Content-Type': 'application/json',
              'API-Version': 'v2',
            },
            body: {
              email: 'user@example.com',
              password: 'SecurePassword123!',
              firstName: 'John',
              lastName: 'Doe',
            },
            response: {
              id: 'user-id',
              email: 'user@example.com',
              accessToken: 'jwt-token',
              refreshToken: 'refresh-token',
            },
          },
          {
            title: 'Login',
            method: 'POST',
            url: '/api/auth/login',
            headers: {
              'Content-Type': 'application/json',
              'API-Version': 'v2',
            },
            body: {
              email: 'user@example.com',
              password: 'SecurePassword123!',
            },
            response: {
              accessToken: 'jwt-token',
              refreshToken: 'refresh-token',
              user: {
                id: 'user-id',
                email: 'user@example.com',
              },
            },
          },
        ],
      },
      versioning: {
        description: 'API versioning examples',
        examples: [
          {
            title: 'Request with version header',
            method: 'GET',
            url: '/api/users',
            headers: {
              Authorization: 'Bearer jwt-token',
              'API-Version': 'v2',
            },
          },
          {
            title: 'Request with URL path version',
            method: 'GET',
            url: '/api/v2/users',
            headers: {
              Authorization: 'Bearer jwt-token',
            },
          },
          {
            title: 'Request with Accept header version',
            method: 'GET',
            url: '/api/users',
            headers: {
              Accept: 'application/json;version=v2',
              Authorization: 'Bearer jwt-token',
            },
          },
        ],
      },
    };
  }

  /**
   * Get API rate limiting information
   */
  @Get('rate-limits')
  getRateLimits() {
    return {
      description: 'API rate limiting information',
      limits: {
        authentication: {
          loginAttempts: '5 per 15 minutes',
          resetPasswordAttempts: '3 per 24 hours',
          emailVerification: '5 per hour',
        },
        general: {
          default: '1000 requests per hour',
          authenticated: '5000 requests per hour',
          api_key: '10000 requests per hour',
        },
      },
      headers: {
        'X-RateLimit-Limit': 'Total requests allowed',
        'X-RateLimit-Remaining': 'Remaining requests',
        'X-RateLimit-Reset': 'Unix timestamp when limit resets',
      },
    };
  }
}
