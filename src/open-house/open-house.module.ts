// @ts-nocheck

import { Module } from '@nestjs/common';
import { OpenHouseController } from './open-house.controller';
import { OpenHouseService } from './open-house.service';
import { PrismaModule } from '../database/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [PrismaModule, NotificationsModule, ScheduleModule.forRoot()],
  controllers: [OpenHouseController],
  providers: [OpenHouseService],
  exports: [OpenHouseService],
})
export class OpenHouseModule {}
