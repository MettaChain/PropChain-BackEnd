import { Module } from '@nestjs/common';
import { DuplicateDetectionService } from './duplicate-detection.service';
import { DuplicateDetectionController } from './duplicate-detection.controller';
import { PrismaModule } from '../database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { FraudModule } from '../fraud/fraud.module';

@Module({
  imports: [PrismaModule, AuthModule, FraudModule],
  controllers: [DuplicateDetectionController],
  providers: [DuplicateDetectionService],
  exports: [DuplicateDetectionService],
})
export class DuplicateDetectionModule {}
