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
  const REQUIRED_NODE_MAJOR = 20;
  const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
  if (Number.isNaN(nodeMajor) || nodeMajor < REQUIRED_NODE_MAJOR) {
    logger.error(
      `Node.js >= ${REQUIRED_NODE_MAJOR} required, found ${process.versions.node}. ` +
        `Please upgrade Node.js (see https://nodejs.org/).`,
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
}
