import { UserRole } from '@prisma/client';

export type AuthUserPayload = {
  sub: string;
  email: string;
  role: UserRole;
  type: 'access' | 'refresh' | 'api-key';
  jti?: string;
  apiKeyId?: string;
  apiKeyPermissions?: string[];
};
