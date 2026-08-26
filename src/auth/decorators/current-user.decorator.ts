import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthUserPayload } from '../types/auth-user.type';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUserPayload => {
    const request = context.switchToHttp().getRequest();
    return request.authUser;
  },
);
