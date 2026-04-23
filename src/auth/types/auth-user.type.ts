import { UserRole } from '../../types/prisma.types';

export type AuthUserPayload = {
  sub: string;
  email: string;
  role: UserRole;
  type: 'access' | 'refresh' | 'api-key';
  jti?: string;
  apiKeyId?: string;
};
