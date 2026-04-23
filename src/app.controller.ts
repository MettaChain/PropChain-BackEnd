import { Controller, Get } from '@nestjs/common';
import { ApiVersionEnum } from './versioning/api-version.constants';
import { ApiVersion, DeprecatedEndpoint } from './versioning/api-version.decorator';
import { GetVersion } from './versioning/get-version.decorator';

@Controller()
export class AppController {
  @Get()
  @ApiVersion([ApiVersionEnum.V1, ApiVersionEnum.V2])
  getHello(): string {
    return 'Welcome to PropChain API';
  }

  @Get('health')
  @ApiVersion([ApiVersionEnum.V1, ApiVersionEnum.V2])
  health(): { status: string; timestamp: string } {
    return {
      status: 'OK',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('version')
  @ApiVersion([ApiVersionEnum.V1, ApiVersionEnum.V2])
  getVersionInfo(@GetVersion() version: ApiVersionEnum) {
    return {
      currentVersion: version,
      supportedVersions: [ApiVersionEnum.V1, ApiVersionEnum.V2],
      defaultVersion: ApiVersionEnum.V2,
    };
  }

  @Get('deprecated-endpoint')
  @DeprecatedEndpoint('This endpoint has been deprecated. Please use /api/v2/new-endpoint instead.')
  deprecatedEndpoint(): { message: string } {
    return {
      message: 'This endpoint is deprecated and will be removed in a future version',
    };
  }
}
