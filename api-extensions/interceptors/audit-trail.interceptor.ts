import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../../src/database/prisma.service';

export const AUDIT_TRAIL_KEY = 'audit-trail';

export enum AuditLevel {
  BASIC = 'basic',
  DETAILED = 'detailed',
  FULL = 'full',
}

export interface AuditOptions {
  level?: AuditLevel;
  action?: string;
  entityType?: string;
}

export const Audited = (options: AuditOptions = {}) => SetMetadata(AUDIT_TRAIL_KEY, options);

const MUTATION_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

interface AuditRequest {
  authUser?: { sub?: string; id?: string };
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string };
  method?: string;
  route?: { path?: string };
  url?: string;
  body?: unknown;
  auditBefore?: unknown;
  existingState?: unknown;
}

@Injectable()
export class AuditTrailInterceptor implements NestInterceptor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const options = this.reflector.getAllAndOverride<AuditOptions>(AUDIT_TRAIL_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest<AuditRequest>();
    const method = request.method ?? '';

    return next.handle().pipe(
      tap((result) => {
        if (!MUTATION_METHODS.has(method)) return;
        const userId = request.authUser?.sub ?? request.authUser?.id;
        if (!userId) return;

        const level = options?.level ?? AuditLevel.DETAILED;
        const path = request.route?.path ?? request.url ?? '';
        const action =
          options?.action ?? `AUDIT_${method}_${path.replace(/\//g, '_').toUpperCase()}`;
        const metadata: Record<string, unknown> = {
          method,
          path,
          level,
        };
        if (level === AuditLevel.DETAILED || level === AuditLevel.FULL) {
          metadata.after = result;
        }
        if (level === AuditLevel.FULL) {
          metadata.before = request.auditBefore ?? request.existingState ?? request.body;
        }

        this.prisma.activityLog
          .create({
            data: {
              userId,
              action,
              entityType: options?.entityType ?? 'UNKNOWN',
              description: `Audit: ${method} ${path}`,
              ipAddress: this.clientIp(request),
              userAgent: this.headerValue(request, 'user-agent'),
              metadata: metadata as Prisma.InputJsonValue,
            },
          })
          .catch(() => undefined);
      }),
    );
  }

  private clientIp(request: AuditRequest): string {
    const forwarded = request.headers?.['x-forwarded-for'];
    const firstHop = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return (
      firstHop?.split(',')[0].trim() || request.ip || request.socket?.remoteAddress || 'unknown'
    );
  }

  private headerValue(request: AuditRequest, name: string): string | undefined {
    const value = request.headers?.[name];
    return Array.isArray(value) ? value[0] : value;
  }
}
