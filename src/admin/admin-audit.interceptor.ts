import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class AdminAuditInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const user = request.authUser;
    const ip =
      request.headers['x-forwarded-for']?.split(',')[0].trim() ||
      request.ip ||
      request.socket?.remoteAddress ||
      'unknown';
    const method = request.method;
    const path = request.route?.path || request.url;

    return next.handle().pipe(
      tap(() => {
        if (!user?.sub) return;
        this.prisma.activityLog
          .create({
            data: {
              userId: user.sub,
              action: `ADMIN_${method}_${path.replace(/\//g, '_').toUpperCase()}`,
              entityType: 'ADMIN',
              description: `Admin action: ${method} ${path}`,
              ipAddress: ip,
              userAgent: request.headers['user-agent'],
              metadata: { method, path },
            },
          })
          .catch(() => {
            // Non-blocking: audit log failure should not affect the response
          });
      }),
    );
  }
}
