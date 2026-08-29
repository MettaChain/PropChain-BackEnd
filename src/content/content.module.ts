import { Module } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';

@Module({
  controllers: [ContentController],
  providers: [ContentService, PrismaService],
})
export class ContentModule {}