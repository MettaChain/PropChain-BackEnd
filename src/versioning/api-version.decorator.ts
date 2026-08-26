/**
 * API Version Decorators
 * Decorators for marking endpoints with specific API versions
 */

import { SetMetadata } from '@nestjs/common';
import { ApiVersionEnum } from './api-version.constants';

export const API_VERSION_KEY = 'apiVersion';
export const DEPRECATED_KEY = 'isDeprecated';
export const DEPRECATION_MESSAGE_KEY = 'deprecationMessage';

/**
 * Decorator to mark an endpoint with a specific API version
 * @param version - The API version(s) this endpoint supports
 */
export function ApiVersion(version: ApiVersionEnum | ApiVersionEnum[]) {
  return SetMetadata(API_VERSION_KEY, Array.isArray(version) ? version : [version]);
}

/**
 * Decorator to mark an endpoint as deprecated
 * @param message - Optional deprecation message
 */
export function Deprecated(message?: string) {
  return (target: any, propertyKey?: string | symbol, descriptor?: PropertyDescriptor) => {
    SetMetadata(DEPRECATED_KEY, true)(target, propertyKey as any, descriptor as any);
    if (message) {
      SetMetadata(DEPRECATION_MESSAGE_KEY, message)(target, propertyKey as any, descriptor as any);
    }
  };
}

/**
 * Decorator to mark an endpoint as deprecated with a specific message
 * @param message - The deprecation message
 */
export function DeprecatedEndpoint(message: string) {
  return (target: any, propertyKey?: string | symbol, descriptor?: PropertyDescriptor) => {
    SetMetadata(DEPRECATED_KEY, true)(target, propertyKey as any, descriptor as any);
    SetMetadata(DEPRECATION_MESSAGE_KEY, message)(target, propertyKey as any, descriptor as any);
  };
}
