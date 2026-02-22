import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from '../auth.service';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly authService: AuthService) {
    super();
  }

  async canActivate(context: any): Promise<boolean> {
    const result = (await super.canActivate(context)) as boolean;

    if (result) {
      const request = context.switchToHttp().getRequest();
      const user = request.user;

      // Check if token is blacklisted
      if (user && user.jti) {
        const isBlacklisted = await this.authService.isTokenBlacklisted(user.jti);
        if (isBlacklisted) {
          throw new UnauthorizedException('Token has been revoked');
        }
      }
    }

    return result;
  }
}
