import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SessionsService } from './sessions.service';
import { SessionsController } from './sessions.controller';
import { SessionRevocationService } from './session-revocation.service';
import { PrismaModule } from '../database/prisma.module';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [SessionsController],
  providers: [SessionsService, SessionRevocationService],
  exports: [SessionsService, SessionRevocationService],
})
export class SessionsModule {}
