// @ts-nocheck

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QueueController } from './queue.controller';
import { QueueMonitoringService } from './queue.service';

@Module({
  imports: [BullModule.registerQueue({ name: 'mail' })],
  controllers: [QueueController],
  providers: [QueueMonitoringService],
  exports: [QueueMonitoringService],
})
export class QueueModule {}
