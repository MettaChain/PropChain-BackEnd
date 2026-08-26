import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';

import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class AdminAccessLoggingInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();

    const response = context.switchToHttp().getResponse();

    return next.handle().pipe(
      tap(() => {
        const user = request.user;
        if (!user?.id) return;

        this.prisma.activityLog
          .create({
            data: {
              userId: user.id,
              action: 'ADMIN_DASHBOARD_ACCESS',
              entityType: 'dashboard',
              description: 'Admin dashboard access',
              metadata: {
                path: request.originalUrl,
                method: request.method,
                statusCode: response.statusCode,
                timestamp: new Date().toISOString(),
              },
            },
          })
          .catch(() => {
            // Non-blocking: audit log failure should not affect the response
          });
      }),
    );
  }
}
