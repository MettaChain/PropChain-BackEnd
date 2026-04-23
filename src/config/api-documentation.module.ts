/**
 * API Documentation Module
 * Provides Swagger/OpenAPI documentation and related endpoints
 */

import { Module } from '@nestjs/common';
import { ApiDocsController } from './api-docs.controller';

@Module({
  controllers: [ApiDocsController],
})
export class ApiDocumentationModule {}
