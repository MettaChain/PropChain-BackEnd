// Valuation-specific type definitions

export interface PropertyFeatures {
  id?: string;
  location: string;
  bedrooms?: number;
  bathrooms?: number;
  squareFootage?: number;
  yearBuilt?: number;
  propertyType?: string;
  lotSize?: number;
  // Allow additional properties with proper typing
  [key: string]: string | number | boolean | undefined;
}

export interface ValuationResult {
  propertyId: string;
  estimatedValue: number;
  confidenceScore: number;
  valuationDate: Date;
  source: string;
  marketTrend?: string;
  featuresUsed?: PropertyFeatures;
  rawData?: Record<string, any>;
}

export interface ExternalApiResponse {
  estimatedValue: number;
  confidenceScore: number;
  marketTrend: string;
  comparableProperties: number;
  rawData: Record<string, any>;
}

export interface ValuationRequest {
  propertyId: string;
  features: PropertyFeatures;
  includeHistory?: boolean;
  forceRefresh?: boolean;
}

export interface MarketDataPoint {
  date: Date;
  value: number;
  source: string;
  confidence: number;
}

export interface MarketTrendAnalysis {
  trend: 'up' | 'down' | 'stable';
  percentageChange: number;
  dataPoints: MarketDataPoint[];
  period: string;
}

export interface ComparableProperty {
  id: string;
  location: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  squareFootage: number;
  distanceMiles: number;
  saleDate: Date;
  confidenceScore: number;
}

export interface ValuationMetadata {
  calculationMethod: string;
  dataSources: string[];
  lastUpdated: Date;
  nextUpdate: Date;
  cacheExpiry: Date;
}