import { NestFactory } from '@nestjs/core';
import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { VersionHeaderInterceptor } from './versioning/version-header.interceptor';
import { DeprecationWarningInterceptor } from './versioning/deprecation-warning.interceptor';
import { CacheMetricsInterceptor } from './cache/cache-metrics.interceptor';
import { RateLimitGuard } from './auth/guards/rate-limit.guard';
import { RateLimitService } from './auth/rate-limit.service';
import { RateLimitHeadersInterceptor } from './auth/interceptors/rate-limit-headers.interceptor';
import { ResponseFormatInterceptor } from './common/interceptors/response-format.interceptor';
import { setupOpenAPIEndpoint, setupSwagger } from './config/swagger.config';
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

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Issue #914 – replace NestJS default ConsoleLogger with our structured logger
    logger: new AppLogger('NestApplication'),
  });

  // Issue #1195 – only trust forwarded headers behind a configured reverse
  // proxy. Without this, RateLimitGuard ignores x-forwarded-for entirely so a
  // spoofed header cannot rotate the per-IP rate-limit buckets.
  const trustProxy = process.env.TRUST_PROXY;
  if (trustProxy) {
    app.set('trust proxy', trustProxy);
  } else {
    app.set('trust proxy', false);
  }

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
    allowedHeaders: ['Content-Type', 'Authorization', 'API-Version', 'api-key', 'x-api-key'],
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

  // Issue #964 / #1234 – Localize validation messages using the request's
  // Accept-Language (and optional user preference) captured by middleware
  // into AsyncLocalStorage. exceptionFactory has no Request; the store bridges it.
  const { I18nService } = await import('./i18n/i18n.service');
  const { getRequestLanguageContext, runWithRequestLanguage } = await import(
    './common/request-language.store'
  );
  const i18n = app.get(I18nService);

  app.use((req: { headers: Record<string, string | string[] | undefined>; user?: { languagePreference?: string | null } }, _res: unknown, next: () => void) => {
    const accept =
      typeof req.headers['accept-language'] === 'string'
        ? req.headers['accept-language']
        : undefined;
    const xLang =
      typeof req.headers['x-language'] === 'string' ? req.headers['x-language'] : undefined;
    runWithRequestLanguage(
      {
        acceptLanguageHeader: accept ?? null,
        userPreference: req.user?.languagePreference ?? xLang ?? null,
      },
      () => next(),
    );
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors) => {
        const messages = (errors ?? []).flatMap((err) =>
          Object.values((err as { constraints?: Record<string, string> }).constraints ?? {}),
        );
        const langCtx = getRequestLanguageContext();
        const translated = messages.map((message) =>
          i18n.translate(message, {
            acceptLanguageHeader: langCtx.acceptLanguageHeader,
            userPreference: langCtx.userPreference,
          }),
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

  // Setup Swagger documentation and serve the same spec at /api/openapi.json
  const openApiDocument = setupSwagger(app);
  setupOpenAPIEndpoint(app, openApiDocument);

  app.enableShutdownHooks();

  const port = process.env.PORT || 3000;
  await app.listen(port);
  logger.log(`PropChain API running on http://localhost:${port}`);

  // Issue #1249 – Dedicated Prometheus metrics listener on METRICS_PORT
  const metricsPortEnv = process.env.METRICS_PORT;
  if (metricsPortEnv) {
    const metricsPort = parseInt(metricsPortEnv, 10);
    if (!isNaN(metricsPort) && metricsPort !== Number(port)) {
      const http = await import('http');
      const { register } = await import('prom-client');
      const metricsServer = http.createServer(async (req, res) => {
        if (req.url === '/metrics' && req.method === 'GET') {
          const expectedToken = process.env.METRICS_BEARER_TOKEN;
          if (expectedToken) {
            const auth = req.headers['authorization'];
            const token = auth?.startsWith('Bearer ')
              ? auth.substring(7)
              : req.headers['x-metrics-token'];
            if (token !== expectedToken) {
              res.writeHead(401, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ statusCode: 401, message: 'Unauthorized' }));
              return;
            }
          }
          res.writeHead(200, { 'Content-Type': register.contentType });
          res.end(await register.metrics());
        } else {
          res.writeHead(404);
          res.end();
        }
      });
      metricsServer.listen(metricsPort, () => {
        logger.log(
          `📊 Dedicated Prometheus metrics listener running on http://localhost:${metricsPort}/metrics`,
        );
      });
    }
  }

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
