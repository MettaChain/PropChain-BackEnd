import { JoiSchemaConfig } from './interfaces/joi-schema-config.interface';

// Changed return type to 'any' to allow custom properties not yet in the interface
export default (): any => ({
  // Application
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT, 10) || 3000,
  HOST: process.env.HOST || '0.0.0.0',
  API_PREFIX: process.env.API_PREFIX || 'api',
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
  SWAGGER_ENABLED: process.env.SWAGGER_ENABLED !== 'false',

  // Database
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/propchain',

  // Redis
  REDIS_HOST: process.env.REDIS_HOST || 'localhost',
  REDIS_PORT: parseInt(process.env.REDIS_PORT, 10) || 6379,
  REDIS_PASSWORD: process.env.REDIS_PASSWORD,
  REDIS_DB: parseInt(process.env.REDIS_DB, 10) || 0,

  // JWT
  JWT_SECRET: process.env.JWT_SECRET || 'your-super-secret-jwt-key',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '24h',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'your-super-secret-refresh-key',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',

  // API Keys
  API_KEY: process.env.API_KEY,
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || 'your-32-char-encryption-key-here',

  // Blockchain/Web3
  BLOCKCHAIN_NETWORK: process.env.BLOCKCHAIN_NETWORK || 'sepolia',
  RPC_URL: process.env.RPC_URL || 'https://sepolia.infura.io/v3/YOUR_PROJECT_ID',
  PRIVATE_KEY: process.env.PRIVATE_KEY,
  ETHERSCAN_API_KEY: process.env.ETHERSCAN_API_KEY,
  WEB3_STORAGE_TOKEN: process.env.WEB3_STORAGE_TOKEN,

  // IPFS
  IPFS_GATEWAY_URL: process.env.IPFS_GATEWAY_URL || 'https://ipfs.io/ipfs/',
  IPFS_API_URL: process.env.IPFS_API_URL || 'https://ipfs.infura.io:5001',
  IPFS_PROJECT_ID: process.env.IPFS_PROJECT_ID,
  IPFS_PROJECT_SECRET: process.env.IPFS_PROJECT_SECRET,

  // Rate Limiting
  THROTTLE_TTL: parseInt(process.env.THROTTLE_TTL, 10) || 60,
  THROTTLE_LIMIT: parseInt(process.env.THROTTLE_LIMIT, 10) || 10,
  
  // API Key Rate Limiting
  API_KEY_RATE_LIMIT_PER_MINUTE: parseInt(process.env.API_KEY_RATE_LIMIT_PER_MINUTE, 10) || 60,

  // File Upload
  MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE, 10) || 10 * 1024 * 1024, // 10MB
  ALLOWED_FILE_TYPES: process.env.ALLOWED_FILE_TYPES?.split(',') || [
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
  ],

  // Email (for notifications)
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: parseInt(process.env.SMTP_PORT, 10) || 587,
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  EMAIL_FROM: process.env.EMAIL_FROM || 'noreply@propchain.io',

  // Monitoring
  SENTRY_DSN: process.env.SENTRY_DSN,
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',

  // External Services
  COINGECKO_API_KEY: process.env.COINGECKO_API_KEY,
  OPENSEA_API_KEY: process.env.OPENSEA_API_KEY,

  // Smart Contracts
  PROPERTY_NFT_ADDRESS: process.env.PROPERTY_NFT_ADDRESS,
  ESCROW_CONTRACT_ADDRESS: process.env.ESCROW_CONTRACT_ADDRESS,
  GOVERNANCE_CONTRACT_ADDRESS: process.env.GOVERNANCE_CONTRACT_ADDRESS,

  // Security
  BCRYPT_ROUNDS: parseInt(process.env.BCRYPT_ROUNDS, 10) || 12,
  SESSION_SECRET: process.env.SESSION_SECRET || 'your-session-secret-key',

  // Development
  MOCK_BLOCKCHAIN: process.env.MOCK_BLOCKCHAIN === 'true',
  ENABLE_SEED_DATA: process.env.ENABLE_SEED_DATA === 'true',
});