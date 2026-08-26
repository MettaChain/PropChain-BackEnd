/**
 * Versioning Module
 * Provides API versioning utilities and services
 */

import { Module, Global } from '@nestjs/common';
import { VersionRoutingService } from './version-routing.service';
import { BackwardCompatibilityService } from './backward-compatibility.service';

@Global()
@Module({
  providers: [VersionRoutingService, BackwardCompatibilityService],
  exports: [VersionRoutingService, BackwardCompatibilityService],
})
export class VersioningModule {}
