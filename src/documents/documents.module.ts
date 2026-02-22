import { Module } from '@nestjs/common';
import storageConfig from '../config/storage.config';
import { DocumentController } from './document.controller';
import {
  DocumentService,
  InMemoryStorageProvider,
  S3StorageProvider,
  STORAGE_CONFIG,
  STORAGE_PROVIDER,
} from './document.service';
import { FileStorageService } from './storage/file-storage.service';

@Module({
  controllers: [DocumentController],
  providers: [
    DocumentService,
    FileStorageService,
    {
      provide: STORAGE_CONFIG,
      useFactory: storageConfig,
    },
    {
      provide: STORAGE_PROVIDER,
      useFactory: (config: ReturnType<typeof storageConfig>) => {
        if (config.provider === 'memory') {
          return new InMemoryStorageProvider(config);
        }
        return new S3StorageProvider(config);
      },
      inject: [STORAGE_CONFIG],
    },
  ],
})
export class DocumentsModule {}
