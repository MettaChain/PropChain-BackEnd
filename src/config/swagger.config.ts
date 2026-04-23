/**
 * Swagger/OpenAPI Configuration
 * Sets up comprehensive API documentation with Swagger UI
 */

import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { INestApplication } from '@nestjs/common';

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
        description: 'API Key for server-to-server authentication',
      },
      'api-key',
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
    .addServer('http://localhost:3000', 'Development Server')
    .addServer('https://api.propchain.io', 'Production Server')
    .addTag('Authentication', 'User authentication and authorization')
    .addTag('Users', 'User management endpoints')
    .addTag('Properties', 'Property management endpoints')
    .addTag('Dashboard', 'Dashboard and analytics endpoints')
    .addTag('Sessions', 'Session management endpoints')
    .addTag('Trust Score', 'Trust score calculation and management')
    .addTag('Email', 'Email verification endpoints')
    .addTag('Versioning', 'API versioning information')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  // Setup Swagger UI at /api/docs
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorizationData: true,
      displayRequestDuration: true,
      filter: true,
      showRequestHeaders: true,
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
    customJs: [
      'https://cdn.jsdelivr.net/npm/swagger-ui-dist@3/swagger-ui.js',
      'https://cdn.jsdelivr.net/npm/swagger-ui-dist@3/swagger-ui-standalone-preset.js',
    ],
  });

  console.log('✅ Swagger UI available at http://localhost:3000/api/docs');
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
  (app as any).openAPIDocument = document;
}
