import { ExecutionContext, Injectable } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { JwtAuthGuard } from './jwt-auth.guard';

@Injectable()
export class GqlAuthGuard extends JwtAuthGuard {
  getRequest(context: ExecutionContext) {
    const ctx = GqlExecutionContext.create(context);
    return ctx.getContext().req;
  }

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = this.getRequest(context);
    const authorizationHeader = request.headers.authorization;
    const token = this.extractBearerToken(authorizationHeader);

    if (!token) {
      return false; // Or throw UnauthorizedException
    }

    try {
      request.authUser = await this.authService.validateAccessToken(token);
      request.accessToken = token;
      return true;
    } catch (e) {
      return false;
    }
  }

  protected override extractBearerToken(header?: string): string | null {
    if (!header) {
      return null;
    }

    const [scheme, token] = header.split(' ');
    return scheme === 'Bearer' && token ? token : null;
  }
}
