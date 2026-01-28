import { registerAs } from '@nestjs/config';

export default registerAs('valuation', () => ({
  // External API settings
  externalApi: {
    zillowApiKey: process.env.ZILLOW_API_KEY,
    redfinApiKey: process.env.REDFIN_API_KEY,
    coreLogicApiKey: process.env.CORE_LOGIC_API_KEY,
    maxmindLicenseKey: process.env.MAXMIND_LICENSE_KEY,
  },
  
  // Valuation settings
  valuation: {
    defaultConfidenceThreshold: parseFloat(process.env.VALUATION_CONFIDENCE_THRESHOLD) || 0.7,
    cacheTtl: parseInt(process.env.VALUATION_CACHE_TTL, 10) || 86400, // 24 hours
    maxRetries: parseInt(process.env.VALUATION_MAX_RETRIES, 10) || 3,
    timeout: parseInt(process.env.VALUATION_TIMEOUT, 10) || 10000, // 10 seconds
  },
  
  // Market trend analysis
  marketTrends: {
    apiEndpoint: process.env.MARKET_TRENDS_API_ENDPOINT,
    apiKey: process.env.MARKET_TRENDS_API_KEY,
    updateFrequency: parseInt(process.env.MARKET_TRENDS_UPDATE_FREQ, 10) || 3600, // 1 hour
  },
  
  // Rate limiting
  rateLimiting: {
    maxRequestsPerMinute: parseInt(process.env.VALUATION_RATE_LIMIT_PER_MINUTE, 10) || 10,
    maxRequestsPerHour: parseInt(process.env.VALUATION_RATE_LIMIT_PER_HOUR, 10) || 100,
  },
  
  // Feature weights for valuation algorithm
  featureWeights: {
    location: parseFloat(process.env.LOCATION_WEIGHT) || 0.3,
    size: parseFloat(process.env.SIZE_WEIGHT) || 0.25,
    age: parseFloat(process.env.AGE_WEIGHT) || 0.15,
    amenities: parseFloat(process.env.AMENITIES_WEIGHT) || 0.2,
    marketConditions: parseFloat(process.env.MARKET_CONDITIONS_WEIGHT) || 0.1,
  },
}));