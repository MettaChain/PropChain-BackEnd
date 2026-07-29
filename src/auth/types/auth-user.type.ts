// @ts-nocheck

import { UserRole, UserTier } from '@prisma/client';

export type AuthUserPayload = {
  sub: string;
  email: string;
  role: UserRole;
  tier: UserTier;
  type: 'access' | 'refresh' | 'api-key';
  jti?: string;
  apiKeyId?: string;
  apiKeyPermissions?: string[];
};
