// API-related type definitions

// HTTP request/response types
export interface HttpRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  query: Record<string, string | string[]>;
  params: Record<string, string>;
  body: any;
  ip: string;
  userAgent: string;
}

export interface HttpResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: any;
  timestamp: Date;
}

// API endpoint metadata
export interface ApiEndpoint {
  path: string;
  method: string;
  description: string;
  tags: string[];
  deprecated?: boolean;
  version?: string;
  permissions: string[];
  rateLimit?: {
    points: number;
    duration: number;
  };
}

// API documentation types
export interface ApiDocumentation {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
    termsOfService?: string;
    contact?: {
      name?: string;
      url?: string;
      email?: string;
    };
    license?: {
      name: string;
      url?: string;
    };
  };
  servers: {
    url: string;
    description?: string;
  }[];
  paths: Record<string, Record<string, ApiOperation>>;
  components: {
    schemas: Record<string, ApiSchema>;
    securitySchemes: Record<string, ApiSecurityScheme>;
  };
}

export interface ApiOperation {
  summary: string;
  description?: string;
  operationId: string;
  tags: string[];
  parameters?: ApiParameter[];
  requestBody?: ApiRequestBody;
  responses: Record<string, ApiResponseSchema>;
  security?: ApiSecurityRequirement[];
  deprecated?: boolean;
}

export interface ApiParameter {
  name: string;
  in: 'query' | 'header' | 'path' | 'cookie';
  description?: string;
  required: boolean;
  schema: ApiSchema;
}

export interface ApiRequestBody {
  description?: string;
  required: boolean;
  content: Record<string, { schema: ApiSchema }>;
}

export interface ApiResponseSchema {
  description: string;
  content?: Record<string, { schema: ApiSchema }>;
}

export interface ApiSchema {
  type: string;
  format?: string;
  description?: string;
  example?: any;
  enum?: any[];
  properties?: Record<string, ApiSchema>;
  items?: ApiSchema;
  required?: string[];
  additionalProperties?: boolean | ApiSchema;
}

export interface ApiSecurityScheme {
  type: 'apiKey' | 'http' | 'oauth2' | 'openIdConnect';
  description?: string;
  name?: string;
  in?: 'query' | 'header' | 'cookie';
  scheme?: string;
  bearerFormat?: string;
  flows?: Record<string, {
    authorizationUrl?: string;
    tokenUrl?: string;
    refreshUrl?: string;
    scopes: Record<string, string>;
  }>;
  openIdConnectUrl?: string;
}

export interface ApiSecurityRequirement {
  [name: string]: string[];
}

// API Gateway types
export interface ApiGatewayConfig {
  basePath: string;
  version: string;
  cors: {
    origin: string | string[];
    methods: string[];
    allowedHeaders: string[];
    exposedHeaders: string[];
    credentials: boolean;
    maxAge: number;
  };
  rateLimiting: {
    global: {
      points: number;
      duration: number;
    };
    perEndpoint: Record<string, {
      points: number;
      duration: number;
    }>;
  };
  authentication: {
    jwt: {
      secret: string;
      expiresIn: string;
      refreshSecret: string;
      refreshExpiresIn: string;
    };
    apiKey: {
      headerName: string;
      prefix: string;
    };
  };
}

// API Client types
export interface ApiClientConfig {
  baseURL: string;
  timeout: number;
  headers: Record<string, string>;
  retry: {
    maxAttempts: number;
    delay: number;
    backoff: 'linear' | 'exponential';
  };
  authentication?: {
    type: 'bearer' | 'apiKey' | 'basic';
    token?: string;
    apiKey?: string;
    username?: string;
    password?: string;
  };
}

export interface ApiClientResponse<T = any> {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  config: any;
}

// WebSocket types
export interface WebSocketMessage {
  type: string;
  payload: any;
  timestamp: Date;
  id?: string;
}

export interface WebSocketConnection {
  id: string;
  userId?: string;
  sessionId: string;
  connectedAt: Date;
  lastActivity: Date;
  ip: string;
  userAgent: string;
  subscriptions: string[];
}

export interface WebSocketEvent {
  event: string;
  data: any;
  timestamp: Date;
  userId?: string;
  sessionId?: string;
}

// GraphQL types (if needed)
export interface GraphQLRequest {
  query: string;
  variables?: Record<string, any>;
  operationName?: string;
}

export interface GraphQLError {
  message: string;
  locations?: { line: number; column: number }[];
  path?: (string | number)[];
  extensions?: Record<string, any>;
}

export interface GraphQLResponse<T = any> {
  data?: T;
  errors?: GraphQLError[];
}