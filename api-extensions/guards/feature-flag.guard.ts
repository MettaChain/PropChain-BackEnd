import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FEATURE_FLAG_KEY } from './feature-flag.decorator';

export interface FeatureFlagContext {
  userId?: string;
  tenantId?: string;
}

export interface FeatureFlagSource {
  isEnabled(flag: string, context: FeatureFlagContext): boolean | Promise<boolean>;
}

export const FEATURE_FLAG_SOURCE = Symbol('FEATURE_FLAG_SOURCE');

interface AuthenticatedRequest {
  authUser?: {
    sub?: string;
    id?: string;
    tenantId?: string;
  };
  headers?: Record<string, string | string[] | undefined>;
}

interface FeatureFlagOverride {
  users?: string[];
  tenants?: string[];
}

@Injectable()
export class FeatureFlagGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Optional()
    @Inject(FEATURE_FLAG_SOURCE)
    private readonly source?: FeatureFlagSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const flag = this.reflector.getAllAndOverride<string>(FEATURE_FLAG_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!flag) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const flagContext: FeatureFlagContext = {
      userId: request.authUser?.sub ?? request.authUser?.id,
      tenantId: request.authUser?.tenantId ?? this.headerValue(request, 'x-tenant-id'),
    };

    const enabled = this.source
      ? await this.source.isEnabled(flag, flagContext)
      : this.fromEnvironment(flag, flagContext);

    if (!enabled) {
      throw new ForbiddenException(`Feature ${flag} is not enabled for this user or tenant`);
    }

    return true;
  }

  private fromEnvironment(flag: string, context: FeatureFlagContext): boolean {
    if (this.isOverridden(flag, context)) {
      return true;
    }

    const envKey = `FEATURE_FLAG_${flag.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()}`;
    return ['true', '1', 'enabled', 'on'].includes(
      (process.env[envKey] ?? '').trim().toLowerCase(),
    );
  }

  private isOverridden(flag: string, context: FeatureFlagContext): boolean {
    const raw = process.env.FEATURE_FLAG_OVERRIDES;
    if (!raw) return false;

    try {
      const overrides = JSON.parse(raw) as Record<string, FeatureFlagOverride>;
      const override = overrides[flag];
      if (!override) return false;
      if (context.userId && override.users?.includes(context.userId)) return true;
      if (context.tenantId && override.tenants?.includes(context.tenantId)) return true;
    } catch {
      return false;
    }

    return false;
  }

  private headerValue(
    request: AuthenticatedRequest,
    name: string,
  ): string | undefined {
    const value = request.headers?.[name];
    return Array.isArray(value) ? value[0] : value;
  }
}
