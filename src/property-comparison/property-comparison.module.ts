// @ts-nocheck

import { Module } from '@nestjs/common';
import { PropertyComparisonController } from './property-comparison.controller';
import { PropertyComparisonService } from './property-comparison.service';
import { PrismaModule } from '../database/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [PropertyComparisonController],
  providers: [PropertyComparisonService],
  exports: [PropertyComparisonService],
})
export class PropertyComparisonModule {}
