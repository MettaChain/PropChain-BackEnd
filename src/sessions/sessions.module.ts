// @ts-nocheck

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SessionsService } from './sessions.service';
import { SessionsController } from './sessions.controller';
import { PrismaModule } from '../database/prisma.module';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [SessionsController],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
