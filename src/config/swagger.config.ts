/**
 * Swagger/OpenAPI Configuration
 * Sets up comprehensive API documentation with Swagger UI
 */

import { DocumentBuilder, SwaggerModule, OpenAPIObject } from '@nestjs/swagger';
import { INestApplication, Logger } from '@nestjs/common';

const logger = new Logger('SwaggerConfig');

/** Route prefix of the Swagger UI (no leading slash). */
export const SWAGGER_DOCS_PATH = 'api/docs';

/** Servers advertised in the spec (and allowed as connect-src on the docs page). */
export const SWAGGER_SERVERS = [
  { url: 'http://localhost:3000', description: 'Development Server' },
  { url: 'https://api.propchain.io', description: 'Production Server' },
];

/** Content-Security-Policy applied to every non-docs route (see main.ts). */
export const DEFAULT_CONTENT_SECURITY_POLICY =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'";

/** True when the request path is the Swagger UI or one of its assets. */
export function isSwaggerDocsPath(path: string): boolean {
  const docsRoot = `/${SWAGGER_DOCS_PATH}`;
  return path === docsRoot || path.startsWith(`${docsRoot}/`) || path.startsWith(`${docsRoot}-`);
}

/**
 * CSP for the Swagger UI route. Scripts are still restricted to 'self' (all
 * assets are served locally); only what Swagger UI v5 needs on top of the
 * default policy is added: data: images used by swagger-ui.css, and
 * connect-src for the servers listed in the spec so "Try it out" works.
 */
export function buildDocsContentSecurityPolicy(serverUrls: string[] = []): string {
  const origins = new Set<string>();
  for (const url of serverUrls) {
    try {
      origins.add(new URL(url).origin);
    } catch {
      // relative server URLs are covered by 'self'
    }
  }
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    `connect-src ${["'self'", ...origins].join(' ')}`,
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

interface AppWithOpenApiDoc {
  openAPIDocument?: OpenAPIObject;
}

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('PropChain API')
    .setDescription('Blockchain-Powered Real Estate Platform API Documentation')
    .setVersion('2.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter JWT token',
      },
      'access-token',
    )
    .addApiKey(
      {
        type: 'apiKey',
        name: 'api-key',
        in: 'header',
        description:
          'API Key for server-to-server authentication. The legacy `x-api-key` header is also accepted.',
      },
      'api-key',
    )
    .addApiKey(
      {
        type: 'apiKey',
        name: 'x-api-key',
        in: 'header',
        description: 'Legacy alias for the `api-key` header (accepted for compatibility).',
      },
      'x-api-key',
    )
    .addApiKey(
      {
        type: 'apiKey',
        name: 'API-Version',
        in: 'header',
        description: 'API Version (v1, v2)',
      },
      'api-version',
    )
    .addTag('Authentication', 'User authentication and authorization')
    .addTag('Users', 'User management endpoints')
    .addTag('Properties', 'Property management endpoints')
    .addTag('Dashboard', 'Dashboard and analytics endpoints')
    .addTag('Sessions', 'Session management endpoints')
    .addTag('Trust Score', 'Trust score calculation and management')
    .addTag('Email', 'Email verification endpoints')
    .addTag('Versioning', 'API versioning information')
    .addTag('Admin', 'Administrative endpoints — admin role only (role-restricted)')
    .addTag(
      'Fraud',
      'Fraud detection and investigation endpoints — admin role only (role-restricted). ' +
        'Currently routed through the Admin module; a future change may extract these into a dedicated controller.',
    )
    .addTag('Transactions', 'Transaction management endpoints')
    .addTag('Blockchain', 'Blockchain integration endpoints')
    .addTag('Search', 'Property search endpoints')
    .addTag('Documents', 'Document management endpoints')
    .addTag('Notifications', 'Notification endpoints')
    .addTag('Analytics', 'Analytics and reporting endpoints')
    .build();

  config.servers = SWAGGER_SERVERS.map(({ url, description }) => ({ url, description }));

  const document = SwaggerModule.createDocument(app, config);

  // Setup Swagger UI at /api/docs
  SwaggerModule.setup(SWAGGER_DOCS_PATH, app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
      // Disable the badge that calls out to validator.swagger.io
      validatorUrl: null,
      supportedSubmitMethods: ['get', 'post', 'put', 'patch', 'delete'],
      docExpansion: 'list',
      defaultModelsExpandDepth: 1,
      defaultModelExpandDepth: 1,
    },
    customCss: `
      .topbar {
        background-color: #1a1a2e;
      }
      .swagger-ui .topbar {
        padding: 10px;
      }
      .swagger-ui .topbar-wrapper {
        max-width: 100%;
      }
      .swagger-ui .topbar a {
        color: #00d4ff;
      }
      .swagger-ui .info .title {
        color: #00d4ff;
        font-weight: bold;
      }
      .swagger-ui button.topbar-toggle {
        background-color: #00d4ff;
      }
      .swagger-ui .btn-models {
        border-color: #00d4ff;
        color: #00d4ff;
      }
      .swagger-ui .btn-models:hover {
        background-color: #00d4ff;
        color: #1a1a2e;
      }
      .swagger-ui .scheme-container {
        background: #f6f7f9;
      }
      .swagger-ui .topbar-wrapper .topbar-title {
        color: #00d4ff;
      }
    `,
    // No customJs: Swagger UI v5 assets (bundle, preset, init script, CSS) are
    // served from the local swagger-ui-dist package under /api/docs, so the
    // page works with the strict CSP from buildDocsContentSecurityPolicy and
    // makes no external requests.
  });

  logger.log('Swagger UI available at http://localhost:3000/api/docs');
}

/**
 * Generate OpenAPI JSON at /api/docs-json endpoint
 */
export function setupOpenAPIEndpoint(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('PropChain API')
    .setDescription('Blockchain-Powered Real Estate Platform API')
    .setVersion('2.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
      'access-token',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);

  // Store document in app for access via endpoint
  (app as unknown as AppWithOpenApiDoc).openAPIDocument = document;
}
