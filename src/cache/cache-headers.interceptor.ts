import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class CacheHeadersInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const res = context.switchToHttp().getResponse();
    const start = Date.now();

    return next.handle().pipe(
      tap(() => {
        res.setHeader('X-Cache-Time', `${Date.now() - start}ms`);
        res.setHeader('Cache-Control', 'public, max-age=60');
      }),
    );
  }
}
