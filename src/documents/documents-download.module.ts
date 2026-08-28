import { Module } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { SignedUrlService } from './signed-url/signed-url.service';
import { DocumentsDownloadController } from './documents-download.controller';
import { PrismaModule } from '../database/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [DocumentsDownloadController],
  providers: [DocumentsService, SignedUrlService],
})
export class DocumentsDownloadModule {}
