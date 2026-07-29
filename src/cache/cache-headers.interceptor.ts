// @ts-nocheck

import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

const IMAGE_CACHE_DURATIONS: Record<string, number> = {
  'image/avif': 86400 * 30,
  'image/webp': 86400 * 7,
  'image/jpeg': 3600,
  'image/png': 3600,
  'image/gif': 3600,
};

@Injectable()
export class CacheHeadersInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const res = context.switchToHttp().getResponse();
    const req = context.switchToHttp().getRequest();
    const start = Date.now();

    return next.handle().pipe(
      tap(() => {
        res.setHeader('X-Cache-Time', `${Date.now() - start}ms`);

        const contentType = res.getHeader('content-type') as string | undefined;
        const isImageResponse =
          contentType?.startsWith('image/') || req.path?.includes('/uploads/');

        if (isImageResponse) {
          const format = contentType?.split(';')[0]?.trim() || 'image/jpeg';
          const maxAge = IMAGE_CACHE_DURATIONS[format] || 3600;
          res.setHeader('Cache-Control', `public, max-age=${maxAge}`);
          res.setHeader('Vary', 'Accept');
        } else {
          res.setHeader('Cache-Control', 'public, max-age=60');
        }
      }),
    );
  }
}
