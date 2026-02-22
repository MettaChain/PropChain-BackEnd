export interface JoiSchemaConfig {
  // Application
  NODE_ENV: string;
  PORT: number;
  HOST: string;
  API_PREFIX: string;
  CORS_ORIGIN: string;
  SWAGGER_ENABLED: boolean;

  // Database
  DATABASE_URL: string;

  // Redis
  REDIS_HOST: string;
  REDIS_PORT: number;
  REDIS_PASSWORD?: string;
  REDIS_DB: number;

  // JWT
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  JWT_REFRESH_SECRET: string;
  JWT_REFRESH_EXPIRES_IN: string;

  // API Keys
  API_KEY?: string;
  ENCRYPTION_KEY: string;

  // Blockchain/Web3
  BLOCKCHAIN_NETWORK: string;
  RPC_URL: string;
  PRIVATE_KEY?: string;
  ETHERSCAN_API_KEY?: string;
  WEB3_STORAGE_TOKEN?: string;

  // IPFS
  IPFS_GATEWAY_URL: string;
  IPFS_API_URL: string;
  IPFS_PROJECT_ID?: string;
  IPFS_PROJECT_SECRET?: string;

  // Rate Limiting
  THROTTLE_TTL: number;
  THROTTLE_LIMIT: number;
  API_KEY_RATE_LIMIT_PER_MINUTE: number;

  // File Upload
  MAX_FILE_SIZE: number;
  ALLOWED_FILE_TYPES: string[];

  // Email
  SMTP_HOST?: string;
  SMTP_PORT: number;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  EMAIL_FROM: string;

  // Monitoring
  SENTRY_DSN?: string;
  LOG_LEVEL: string;

  // External Services
  COINGECKO_API_KEY?: string;
  OPENSEA_API_KEY?: string;

  // Smart Contracts
  PROPERTY_NFT_ADDRESS?: string;
  ESCROW_CONTRACT_ADDRESS?: string;
  GOVERNANCE_CONTRACT_ADDRESS?: string;

  // Security
  BCRYPT_ROUNDS: number;
  SESSION_SECRET: string;

  // Password Security
  PASSWORD_MIN_LENGTH: number;
  PASSWORD_REQUIRE_SPECIAL_CHARS: boolean;
  PASSWORD_REQUIRE_NUMBERS: boolean;
  PASSWORD_REQUIRE_UPPERCASE: boolean;
  PASSWORD_HISTORY_COUNT: number;
  PASSWORD_EXPIRY_DAYS: number;

  // Authentication Security
  JWT_BLACKLIST_ENABLED: boolean;
  LOGIN_MAX_ATTEMPTS: number;
  LOGIN_LOCKOUT_DURATION: number;
  SESSION_TIMEOUT: number;
  MFA_ENABLED: boolean;
  MFA_CODE_EXPIRY: number;

  // Development
  MOCK_BLOCKCHAIN: boolean;
  ENABLE_SEED_DATA: boolean;
}
