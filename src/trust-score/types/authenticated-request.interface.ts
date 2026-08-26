export interface AuthenticatedRequest {
  authUser: {
    id: string;
    email: string;
    type: 'access' | 'refresh' | 'api-key';
    jti?: string;
    apiKeyId?: string;
  };
  accessToken?: string;
  query: Record<string, string | string[] | undefined>;
}
