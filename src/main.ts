import { NestFactory } from '@nestjs/core';
import { ValidationPipe, BadRequestException } from '@nestjs/common';
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
// Issue #914 – Structured JSON logging in production, pretty-print in dev
import { AppLogger } from './common/logger';
import { TraceInterceptor } from './tracing/trace.interceptor';
// Issue #964 – exception filters are registered globally via APP_FILTER
// providers in AppModule. We deliberately do NOT call useGlobalFilters here
// to avoid registering the same filter twice.

async function bootstrap() {
  validateEnvironment();

  // Issue #914 – use structured AppLogger as NestJS application logger.
  // JSON output in production; pretty-print in development.
  const logger = new AppLogger('Bootstrap');

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

  const app = await NestFactory.create(AppModule, {
    // Issue #914 – replace NestJS default ConsoleLogger with our structured logger
    logger: new AppLogger('NestApplication'),
  });

  // CORS configuration
  const corsOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((origin) => origin.trim())
    : ['http://localhost:3000'];

  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction && corsOrigins.includes('*')) {
    logger.warn('Wildcard CORS origins are not allowed in production. Using default origins.');
    corsOrigins.length = 0;
    corsOrigins.push('http://localhost:3000');
  }

  app.enableCors({
    origin: corsOrigins,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'API-Version', 'api-key'],
  });

  // Security headers middleware
  app.use((req: any, res: any, next: any) => {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'",
    );
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  // Issue #964 – Localize validation error messages via the I18nService.
  const { I18nService } = await import('./i18n/i18n.service');
  const i18n = app.get(I18nService);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors) => {
        const messages = (errors ?? []).flatMap((err) =>
          Object.values((err as { constraints?: Record<string, string> }).constraints ?? {}),
        );
        const translated = messages.map((message) =>
          i18n.translate(message, { acceptLanguageHeader: undefined }),
        );
        return new BadRequestException(
          Array.isArray(translated) && translated.length > 0 ? translated : messages,
        );
      },
    }),
  );

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
    new TraceInterceptor(),
  );

  // Issue #964 – Exception filters are registered globally via APP_FILTER
  // providers in AppModule (see providers array). We avoid calling
  // useGlobalFilters here to prevent double registration of the same
  // filter classes.

  // Register global guards
  const reflector = app.get(Reflector);
  const rateLimitService = app.get(RateLimitService);
  app.useGlobalGuards(new RateLimitGuard(reflector, rateLimitService));

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
  logger.log(
    `✅ Response format interceptor enabled - all API responses now follow standardized format`,
  );
}

bootstrap();
