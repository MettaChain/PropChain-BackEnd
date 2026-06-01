import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';

import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

import { AuditService } from '../../audit/audit.service';

@Injectable()
export class AdminAccessLoggingInterceptor
  implements NestInterceptor
{
  constructor(
    private readonly auditService: AuditService,
  ) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<any> {
    const request =
      context.switchToHttp().getRequest();

    const response =
      context.switchToHttp().getResponse();

    return next.handle().pipe(
      tap(async () => {
        const user = request.user;

        await this.auditService.log({
          action: 'ADMIN_DASHBOARD_ACCESS',
          userId: user?.id,
          resourceType: 'dashboard',
          resourceId: null,
          metadata: {
            path: request.originalUrl,
            method: request.method,
            statusCode: response.statusCode,
            timestamp:
              new Date().toISOString(),
          },
        });
      }),
    );
  }
}