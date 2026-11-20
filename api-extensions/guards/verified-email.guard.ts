import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const REQUIRE_VERIFIED_EMAIL_KEY = 'require-verified-email';

export const RequireVerifiedEmail = () => SetMetadata(REQUIRE_VERIFIED_EMAIL_KEY, true);

interface VerifiedEmailRequest {
  authUser?: {
    sub?: string;
    id?: string;
    isEmailVerified?: boolean;
    emailVerified?: boolean;
  };
}

@Injectable()
export class VerifiedEmailGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<boolean>(REQUIRE_VERIFIED_EMAIL_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required) {
      return true;
    }

    const request = context.switchToHttp().getRequest<VerifiedEmailRequest>();
    const user = request.authUser;

    if (!user?.sub && !user?.id) {
      throw new UnauthorizedException('Authentication required');
    }

    if (!user.isEmailVerified && !user.emailVerified) {
      throw new ForbiddenException('A verified email address is required to access this endpoint');
    }

    return true;
  }
}
