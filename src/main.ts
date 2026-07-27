// @ts-nocheck

import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { VersionHeaderInterceptor } from './versioning/version-header.interceptor';
import { DeprecationWarningInterceptor } from './versioning/deprecation-warning.interceptor';
import { CacheMetricsInterceptor } from './cache/cache-metrics.interceptor';
import { RateLimitGuard } from './auth/guards/rate-limit.guard';
import { RateLimitService } from './auth/rate-limit.service';
import { RateLimitHeadersInterceptor } from './auth/interceptors/rate-limit-headers.interceptor';
import { ResponseFormatInterceptor } from './common/interceptors/response-format.interceptor';
import { setupSwagger } from './config/swagger.config';
import { validateEnvironment } from './utils/validate-env';
// Import our exception filters
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';

async function bootstrap() {
  validateEnvironment();

  const logger = new Logger('Bootstrap');

  // Node.js version check (#775, #754 NestJS 11 requires Node 20+)
  const REQUIRED_NODE_MAJOR = 20;
  const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
  
  if (Number.isNaN(nodeMajor) || nodeMajor < REQUIRED_NODE_MAJOR) {
    logger.error(
      `Node.js >= ${REQUIRED_NODE_MAJOR} required, found ${process.versions.node}. ` +
        `Please upgrade Node.js (see https://nodejs.org/).`,
    );
    process.exit(1);
  }

  const app = await NestFactory.create(AppModule);

  // Global validation pipe
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  }));

  // Register global interceptors
  const responseFormatInterceptor = app.get(ResponseFormatInterceptor);
  const versionHeaderInterceptor = app.get(VersionHeaderInterceptor);
  const deprecationWarningInterceptor = app.get(DeprecationWarningInterceptor);
  const cacheMetricsInterceptor = app.get(CacheMetricsInterceptor);
  const rateLimitHeadersInterceptor = app.get(RateLimitHeadersInterceptor);

  app.useGlobalInterceptors(
    responseFormatInterceptor,
    versionHeaderInterceptor,
    deprecationWarningInterceptor,
    cacheMetricsInterceptor,
    rateLimitHeadersInterceptor,
  );

  // Register global guards
  const reflector = app.get(Reflector);
  const rateLimitService = app.get(RateLimitService);
  app.useGlobalGuards(new RateLimitGuard(rateLimitService, reflector));

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
  logger.log(`✅ Response format interceptor enabled - all API responses now follow standardized format`);
}

bootstrap();