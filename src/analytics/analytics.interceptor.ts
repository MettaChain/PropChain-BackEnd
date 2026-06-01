import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { AnalyticsService } from './analytics.service';
import { AuthUserPayload } from '../auth/types/auth-user.type';

@Injectable()
export class AnalyticsInterceptor implements NestInterceptor {
  constructor(private readonly analytics: AnalyticsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    const start = Date.now();

    const record = (statusCode: number) => {
      const user: AuthUserPayload | undefined = req.authUser;
      this.analytics.record({
        endpoint: req.path,
        method: req.method,
        statusCode,
        responseTime: Date.now() - start,
        userId: user?.sub ?? null,
      });
    };

    return next.handle().pipe(
      tap(() => record(res.statusCode)),
      catchError((err) => {
        // Capture error status codes (e.g. thrown HttpExceptions)
        const status: number = err?.status ?? err?.statusCode ?? 500;
        record(status);
        return throwError(() => err);
      }),
    );
  }
}
