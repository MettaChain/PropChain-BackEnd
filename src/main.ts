// @ts-nocheck

import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { VersionHeaderInterceptor } from './versioning/version-header.interceptor';
import { DeprecationWarningInterceptor } from './versioning/deprecation-warning.interceptor';
import { CacheMetricsInterceptor } from './cache/cache-metrics.interceptor';
import { CacheMonitoringService } from './cache/cache-monitoring.service';
import { RateLimitGuard } from './auth/guards/rate-limit.guard';
import { RateLimitService } from './auth/rate-limit.service';
import { RateLimitHeadersInterceptor } from './auth/interceptors/rate-limit-headers.interceptor';
import { setupSwagger } from './config/swagger.config';
import { validateEnvironment } from './utils/validate-env';

async function bootstrap() {
  validateEnvironment();

  const logger = new Logger('Bootstrap');

  // Node.js version check (#775, #754 NestJS 11 requires Node 20+)
  const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
  if (nodeMajor < 20) {
    logger.error(`Node.js >= 20 required (NestJS 11), found ${process.versions.node}`);
  // Node.js version check (#775):
  // package.json declares engines.node >= 18, but several transitive
  // dependencies (e.g. @nestjs/* v11) require Node 20+. Enforce that here
  // and exit early with a clear message well before any module loads.
  const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
  const REQUIRED_NODE_MAJOR = 20;
  if (Number.isNaN(nodeMajor) || nodeMajor < REQUIRED_NODE_MAJOR) {
    logger.error(
      `Node.js >= ${REQUIRED_NODE_MAJOR} required, found ${process.versions.node}. ` +
        `Please upgrade Node.js (see https://nodejs.org/).`,
    );
    process.exit(1);
  }

  const app = await NestFactory.create(AppModule);

  // Enable CORS
  app.enableCors();

  // Global prefix
  app.setGlobalPrefix('api');

  // Get services for guard initialization
  const reflector = app.get(Reflector);
  const rateLimitService = app.get(RateLimitService);

  // Apply global guards
  app.useGlobalGuards(new RateLimitGuard(reflector, rateLimitService));

  // Apply version header interceptor globally
  app.useGlobalInterceptors(new VersionHeaderInterceptor());

  // Apply deprecation warning interceptor
  app.useGlobalInterceptors(new DeprecationWarningInterceptor(reflector));

  // Apply rate limit headers interceptor
  app.useGlobalInterceptors(new RateLimitHeadersInterceptor());

  // Apply cache metrics interceptor
  // Retrieve the singleton instance from the DI container to ensure consistent dependency injection
  const cacheMetricsInterceptor = app.get(CacheMetricsInterceptor);
  app.useGlobalInterceptors(cacheMetricsInterceptor);

  // Enable a single ValidationPipe with implicit conversion (#754 NestJS 11 upgrade)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Setup Swagger documentation
  setupSwagger(app);

  app.enableShutdownHooks();

  const port = process.env.PORT || 3000;
  await app.listen(port);
  logger.log(`PropChain API running on http://localhost:${port}`);
  logger.log(`API Versioning enabled. Supported versions: v1, v2`);
  logger.log(`📚 Swagger UI available at http://localhost:${port}/api/docs`);
  logger.log(`📋 OpenAPI spec available at http://localhost:${port}/api/openapi.json`);
  logger.log(`💾 Redis Caching enabled`);
  logger.log(`🛡️ Rate Limiting enabled (per-user, per-endpoint, IP-based)`);
}

bootstrap();
