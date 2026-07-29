import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { PrismaModule } from '../database/prisma.module';
import { CacheModuleConfig } from '../cache/cache.module';

@Module({
  imports: [PrismaModule, CacheModuleConfig],
  controllers: [HealthController],
})
export class HealthModule {}
