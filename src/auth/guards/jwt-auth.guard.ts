import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../auth.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(protected readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authorizationHeader = request.headers.authorization;
    const token = this.extractBearerToken(authorizationHeader);

    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    request.authUser = await this.authService.validateAccessToken(token);
    request.accessToken = token;
    return true;
  }

  protected extractBearerToken(header?: string): string | null {
    if (!header) {
      return null;
    }

    const [scheme, token] = header.split(' ');
    return scheme === 'Bearer' && token ? token : null;
  }
}
