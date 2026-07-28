import { Module } from '@nestjs/common';
import { ArchiveService } from './archive.service';
import { PrismaModule } from '../database/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [ArchiveService],
  exports: [ArchiveService],
})
export class ArchiveModule {}
