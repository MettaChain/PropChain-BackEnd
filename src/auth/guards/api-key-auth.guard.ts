import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../auth.service';

@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey = this.extractApiKey(request.headers['x-api-key'], request.headers.authorization);

    if (!apiKey) {
      throw new UnauthorizedException('Missing API key');
    }

    request.authUser = await this.authService.validateApiKey(apiKey);
    return true;
  }

  private extractApiKey(xApiKey?: string | string[], authorizationHeader?: string): string | null {
    if (typeof xApiKey === 'string' && xApiKey.trim()) {
      return xApiKey.trim();
    }

    if (!authorizationHeader) {
      return null;
    }

    const [scheme, token] = authorizationHeader.split(' ');
    return scheme === 'ApiKey' && token ? token : null;
  }
}
