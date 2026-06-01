import { Module } from '@nestjs/common';
import { OpenHouseController } from './open-house.controller';
import { OpenHouseService } from './open-house.service';
import { PrismaModule } from '../database/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [OpenHouseController],
  providers: [OpenHouseService],
  exports: [OpenHouseService],
})
export class OpenHouseModule {}
