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

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  // Enable validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

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
  const cacheMonitoringService = app.get(CacheMonitoringService);
  app.useGlobalInterceptors(new CacheMetricsInterceptor(cacheMonitoringService));

  // Setup Swagger documentation
  setupSwagger(app);

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
