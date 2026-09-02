import { Module } from '@nestjs/common';
import { ContentService } from './content.service';
import { ContentController } from './content.controller';
import { PrismaService } from 'src/database/prisma.service';
@Module({
  providers: [ContentService, PrismaService],
  controllers: [ContentController],
})
export class ContentModule {}
