// @ts-nocheck

import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module';
import { TrustScoreService } from './trust-score.service';
import { TrustScoreController } from './trust-score.controller';

@Module({
  imports: [PrismaModule],
  controllers: [TrustScoreController],
  providers: [TrustScoreService],
  exports: [TrustScoreService],
})
export class TrustScoreModule {}
