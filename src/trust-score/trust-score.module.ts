import { Module } from '@nestjs/common';
import { TrustScoreService } from './trust-score.service';
import { TrustScoreController } from './trust-score.controller';

@Module({
  controllers: [TrustScoreController],
  providers: [TrustScoreService],
  exports: [TrustScoreService],
})
export class TrustScoreModule {}
