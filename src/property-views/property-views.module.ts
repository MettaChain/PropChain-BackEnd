import { Module } from '@nestjs/common';
import { PropertyViewsController } from './property-views.controller';
import { PropertyViewsService } from './property-views.service';
import { PrismaModule } from '../database/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [PropertyViewsController],
  providers: [PropertyViewsService],
  exports: [PropertyViewsService],
})
export class PropertyViewsModule {}
