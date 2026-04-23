/**
 * Get Version Decorator
 * Injects the current API version into controller methods
 */

import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ApiVersionEnum, DEFAULT_API_VERSION } from './api-version.constants';

export const GetVersion = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ApiVersionEnum => {
    const request = ctx.switchToHttp().getRequest();
    return request.apiVersion || DEFAULT_API_VERSION;
  },
);
