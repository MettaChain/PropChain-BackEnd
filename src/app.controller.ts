// @ts-nocheck

import { Controller, Get, Inject } from '@nestjs/common';
import { ApiVersionEnum } from './versioning/api-version.constants';
import { ApiVersion, DeprecatedEndpoint } from './versioning/api-version.decorator';
import { GetVersion } from './versioning/get-version.decorator';
import { PrismaService } from './database/prisma.service';
import { CacheService } from './cache/cache.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Controller()
export class AppController {
  constructor(
    private prisma: PrismaService,
    private cacheService: CacheService,
    @InjectQueue('mail') private mailQueue: Queue,
  ) {}

  @Get()
  @ApiVersion([ApiVersionEnum.V1, ApiVersionEnum.V2])
  getHello(): string { return 'Welcome to PropChain API'; }

  @Get('health')
  @ApiVersion([ApiVersionEnum.V1, ApiVersionEnum.V2])
  async health(): Promise<{
    status: string;
    timestamp: string;
    services: Record<string, any>;
  }> {
    const checks: Record<string, any> = {};

    const dbStart = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = { status: 'ok', latencyMs: Date.now() - dbStart };
    } catch (err: any) {
      checks.database = { status: 'error', error: err.message };
    }

    const redisStart = Date.now();
    try {
      const connected = await this.cacheService.isConnected();
      checks.redis = connected
        ? { status: 'ok', latencyMs: Date.now() - redisStart }
        : { status: 'error', error: 'Redis not connected' };
    } catch (err: any) {
      checks.redis = { status: 'error', error: err.message };
    }

    const queueStart = Date.now();
    try {
      const [waiting, active, delayed] = await Promise.all([
        this.mailQueue.getWaitingCount(),
        this.mailQueue.getActiveCount(),
        this.mailQueue.getDelayedCount(),
      ]);
      checks.emailQueue = {
        status: 'ok',
        latencyMs: Date.now() - queueStart,
        waiting,
        active,
        delayed,
      };
    } catch (err: any) {
      checks.emailQueue = { status: 'error', error: err.message };
    }

    const allOk = Object.values(checks).every((c: any) => c.status === 'ok');
    return { status: allOk ? 'OK' : 'DEGRADED', timestamp: new Date().toISOString(), services: checks };
  }

  @Get('health')
  @ApiVersion([ApiVersionEnum.V1, ApiVersionEnum.V2])
  health(): { status: string; timestamp: string } {
    return {
      status: 'OK',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('version')
  @ApiVersion([ApiVersionEnum.V1, ApiVersionEnum.V2])
  getVersionInfo(@GetVersion() version: ApiVersionEnum) {
    return {
      currentVersion: version,
      supportedVersions: [ApiVersionEnum.V1, ApiVersionEnum.V2],
      defaultVersion: ApiVersionEnum.V2,
    };
  }

  @Get('deprecated-endpoint')
  @DeprecatedEndpoint('This endpoint has been deprecated. Please use /api/v2/new-endpoint instead.')
  deprecatedEndpoint(): { message: string } {
    return {
      message: 'This endpoint is deprecated and will be removed in a future version',
    };
  }
}
