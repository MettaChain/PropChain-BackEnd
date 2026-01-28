import { Injectable, Logger, NotFoundException, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma/prisma.service';
import axios from 'axios';
import { Decimal } from '@prisma/client/runtime/library';

export interface PropertyFeatures {
  id?: string;
  location: string;
  bedrooms?: number;
  bathrooms?: number;
  squareFootage?: number;
  yearBuilt?: number;
  propertyType?: string;
  lotSize?: number;
  [key: string]: any;
}

export interface ValuationResult {
  propertyId: string;
  estimatedValue: number;
  confidenceScore: number;
  valuationDate: Date;
  source: string;
  marketTrend?: string;
  featuresUsed?: PropertyFeatures;
  rawData?: any;
}

@Injectable()
export class ValuationService {
  private readonly logger = new Logger(ValuationService.name);
  private readonly externalApis: {
    zillow: { baseUrl: string; apiKey: string };
    redfin: { baseUrl: string; apiKey: string };
    corelogic: { baseUrl: string; apiKey: string };
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    
  ) {
    this.externalApis = {
      zillow: {
        baseUrl: 'https://api.zillow.com/v1',
        apiKey: this.configService.get('valuation.externalApi.zillowApiKey'),
      },
      redfin: {
        baseUrl: 'https://redfin.com/stingray/',
        apiKey: this.configService.get('valuation.externalApi.redfinApiKey'),
      },
      corelogic: {
        baseUrl: 'https://api.corelogic.com/v1',
        apiKey: this.configService.get('valuation.externalApi.coreLogicApiKey'),
      },
    };
  }

  /**
   * Main method to get property valuation
   */
  async getValuation(propertyId: string, features?: PropertyFeatures): Promise<ValuationResult> {
    const cacheKey = `valuation:${propertyId}`;
    
    // Skip cache implementation for now since cache service is not available

    try {
      // Get property from database if features not provided
      if (!features) {
        const property = await this.prisma.property.findUnique({
          where: { id: propertyId },
        });
        
        if (!property) {
          throw new NotFoundException(`Property with ID ${propertyId} not found`);
        }

        features = {
          id: property.id,
          location: property.location,
          bedrooms: property.bedrooms,
          bathrooms: property.bathrooms,
          squareFootage: Number(property.squareFootage),
          yearBuilt: property.yearBuilt,
          propertyType: property.propertyType,
          lotSize: Number(property.lotSize),
        };
      }

      // Normalize features
      const normalizedFeatures = this.normalizeFeatures(features);

      // Get valuation from external APIs
      const valuations = await Promise.all([
        this.getZillowValuation(normalizedFeatures).catch(err => {
          this.logger.warn(`Zillow API failed: ${err.message}`);
          return null;
        }),
        this.getRedfinValuation(normalizedFeatures).catch(err => {
          this.logger.warn(`Redfin API failed: ${err.message}`);
          return null;
        }),
        this.getCoreLogicValuation(normalizedFeatures).catch(err => {
          this.logger.warn(`CoreLogic API failed: ${err.message}`);
          return null;
        }),
      ]);

      // Filter out null results
      const validValuations = valuations.filter(val => val !== null);

      if (validValuations.length === 0) {
        throw new HttpException(
          'All external valuation APIs failed',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

      // Combine valuations using weighted average
      const combinedValuation = this.combineValuations(validValuations);

      // Save valuation to database
      const savedValuation = await this.saveValuation(combinedValuation);

      // Update property with valuation
      await this.updatePropertyWithValuation(propertyId, savedValuation);

      // Cache implementation skipped since cache service is not available

      return savedValuation;

    } catch (error) {
      this.logger.error(`Valuation failed for property ${propertyId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get valuation from Zillow API
   */
  private async getZillowValuation(features: PropertyFeatures): Promise<ValuationResult | null> {
    const apiKey = this.externalApis.zillow.apiKey;
    if (!apiKey) {
      this.logger.warn('Zillow API key not configured');
      return null;
    }

    try {
      // Mock implementation - in real scenario, this would call Zillow's actual API
      const response = await axios.post(`${this.externalApis.zillow.baseUrl}/valuation`, {
        address: features.location,
        bedrooms: features.bedrooms,
        bathrooms: features.bathrooms,
        sqft: features.squareFootage,
        yearBuilt: features.yearBuilt,
      }, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: this.configService.get('valuation.valuation.timeout'),
      });

      return {
        propertyId: features.id || 'unknown',
        estimatedValue: response.data.estimatedValue,
        confidenceScore: response.data.confidenceScore,
        valuationDate: new Date(),
        source: 'zillow',
        marketTrend: response.data.marketTrend,
        featuresUsed: features,
        rawData: response.data,
      };

    } catch (error) {
      this.logger.error(`Zillow API error: ${error.message}`);
      return null;
    }
  }

  /**
   * Get valuation from Redfin API
   */
  private async getRedfinValuation(features: PropertyFeatures): Promise<ValuationResult | null> {
    const apiKey = this.externalApis.redfin.apiKey;
    if (!apiKey) {
      this.logger.warn('Redfin API key not configured');
      return null;
    }

    try {
      // Mock implementation - in real scenario, this would call Redfin's actual API
      const response = await axios.get(`${this.externalApis.redfin.baseUrl}/home-value`, {
        params: {
          location: features.location,
          bedrooms: features.bedrooms,
          bathrooms: features.bathrooms,
          sqft: features.squareFootage,
        },
        headers: {
          'X-API-Key': apiKey,
        },
        timeout: this.configService.get('valuation.valuation.timeout'),
      });

      return {
        propertyId: features.id || 'unknown',
        estimatedValue: response.data.value,
        confidenceScore: response.data.confidence,
        valuationDate: new Date(),
        source: 'redfin',
        marketTrend: response.data.trend,
        featuresUsed: features,
        rawData: response.data,
      };

    } catch (error) {
      this.logger.error(`Redfin API error: ${error.message}`);
      return null;
    }
  }

  /**
   * Get valuation from CoreLogic API
   */
  private async getCoreLogicValuation(features: PropertyFeatures): Promise<ValuationResult | null> {
    const apiKey = this.externalApis.corelogic.apiKey;
    if (!apiKey) {
      this.logger.warn('CoreLogic API key not configured');
      return null;
    }

    try {
      // Mock implementation - in real scenario, this would call CoreLogic's actual API
      const response = await axios.post(`${this.externalApis.corelogic.baseUrl}/property-valuations`, {
        property: {
          address: features.location,
          bedrooms: features.bedrooms,
          bathrooms: features.bathrooms,
          squareFootage: features.squareFootage,
          yearBuilt: features.yearBuilt,
        },
      }, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: this.configService.get('valuation.valuation.timeout'),
      });

      return {
        propertyId: features.id || 'unknown',
        estimatedValue: response.data.valuation,
        confidenceScore: response.data.confidence,
        valuationDate: new Date(),
        source: 'corelogic',
        marketTrend: response.data.marketInsights,
        featuresUsed: features,
        rawData: response.data,
      };

    } catch (error) {
      this.logger.error(`CoreLogic API error: ${error.message}`);
      return null;
    }
  }

  /**
   * Normalize property features for consistent processing
   */
  private normalizeFeatures(features: PropertyFeatures): PropertyFeatures {
    const normalized: PropertyFeatures = { ...features };

    // Normalize location to standard format
    if (normalized.location) {
      normalized.location = normalized.location.trim().toLowerCase();
    }

    // Ensure numeric values are valid
    if (typeof normalized.bedrooms === 'string') {
      normalized.bedrooms = parseInt(normalized.bedrooms, 10);
    }
    if (typeof normalized.bathrooms === 'string') {
      normalized.bathrooms = parseFloat(normalized.bathrooms);
    }
    if (typeof normalized.squareFootage === 'string') {
      normalized.squareFootage = parseFloat(normalized.squareFootage);
    }
    if (typeof normalized.yearBuilt === 'string') {
      normalized.yearBuilt = parseInt(normalized.yearBuilt, 10);
    }
    if (typeof normalized.lotSize === 'string') {
      normalized.lotSize = parseFloat(normalized.lotSize);
    }

    // Set defaults for missing values
    normalized.bedrooms = normalized.bedrooms ?? 0;
    normalized.bathrooms = normalized.bathrooms ?? 0;
    normalized.squareFootage = normalized.squareFootage ?? 0;
    normalized.yearBuilt = normalized.yearBuilt ?? 0;
    normalized.lotSize = normalized.lotSize ?? 0;

    return normalized;
  }

  /**
   * Combine multiple valuations using weighted average
   */
  private combineValuations(valuations: ValuationResult[]): ValuationResult {
    if (valuations.length === 1) {
      return valuations[0];
    }

    // Calculate weighted average based on confidence scores
    let totalWeightedValue = 0;
    let totalWeight = 0;
    let combinedConfidence = 0;

    for (const valuation of valuations) {
      const weight = Math.max(0.1, valuation.confidenceScore); // Minimum weight of 0.1
      totalWeightedValue += valuation.estimatedValue * weight;
      totalWeight += weight;
      combinedConfidence += valuation.confidenceScore;
    }

    const avgValue = totalWeightedValue / totalWeight;
    const avgConfidence = combinedConfidence / valuations.length;

    return {
      propertyId: valuations[0].propertyId,
      estimatedValue: avgValue,
      confidenceScore: avgConfidence,
      valuationDate: new Date(),
      source: 'combined',
      marketTrend: this.getMarketTrendFromValuations(valuations),
      featuresUsed: valuations[0].featuresUsed,
      rawData: { sources: valuations.map(v => ({ source: v.source, value: v.estimatedValue })) },
    };
  }

  /**
   * Extract market trend from multiple valuations
   */
  private getMarketTrendFromValuations(valuations: ValuationResult[]): string {
    const trends = valuations
      .filter(v => v.marketTrend)
      .map(v => v.marketTrend)
      .filter(Boolean);

    if (trends.length === 0) {
      return 'neutral';
    }

    // Simple majority vote for market trend
    const trendCounts = {};
    for (const trend of trends) {
      trendCounts[trend] = (trendCounts[trend] || 0) + 1;
    }

    return Object.keys(trendCounts).reduce((a, b) => 
      trendCounts[a] > trendCounts[b] ? a : b
    );
  }

  /**
   * Save valuation to database
   */
  private async saveValuation(valuation: ValuationResult) {
    const saved = await this.prisma.propertyValuation.create({
      data: {
        propertyId: valuation.propertyId,
        estimatedValue: new Decimal(valuation.estimatedValue.toString()),
        confidenceScore: valuation.confidenceScore,
        valuationDate: valuation.valuationDate,
        source: valuation.source,
        marketTrend: valuation.marketTrend,
        featuresUsed: valuation.featuresUsed ? JSON.stringify(valuation.featuresUsed) : null,
        rawData: valuation.rawData ? JSON.stringify(valuation.rawData) : null,
      },
    });

    // Return in the expected format
    return {
      propertyId: saved.propertyId,
      estimatedValue: Number(saved.estimatedValue),
      confidenceScore: saved.confidenceScore,
      valuationDate: saved.valuationDate,
      source: saved.source,
      marketTrend: saved.marketTrend,
      featuresUsed: valuation.featuresUsed,
      rawData: valuation.rawData,
    };
  }

  /**
   * Update property with latest valuation information
   */
  private async updatePropertyWithValuation(propertyId: string, valuation: ValuationResult) {
    await this.prisma.property.update({
      where: { id: propertyId },
      data: {
        estimatedValue: new Decimal(valuation.estimatedValue.toString()),
        valuationDate: valuation.valuationDate,
        valuationConfidence: valuation.confidenceScore,
        valuationSource: valuation.source,
        lastValuationId: valuation.propertyId,
      },
    });
  }

  /**
   * Get historical valuations for a property
   */
  async getPropertyHistory(propertyId: string): Promise<ValuationResult[]> {
    const valuations = await this.prisma.propertyValuation.findMany({
      where: { propertyId },
      orderBy: { valuationDate: 'desc' },
    });

    return valuations.map(v => ({
      propertyId: v.propertyId,
      estimatedValue: Number(v.estimatedValue),
      confidenceScore: v.confidenceScore,
      valuationDate: v.valuationDate,
      source: v.source,
      marketTrend: v.marketTrend,
      featuresUsed: v.featuresUsed ? JSON.parse(v.featuresUsed as string) : undefined,
      rawData: v.rawData ? JSON.parse(v.rawData as string) : undefined,
    }));
  }

  /**
   * Get market trend analysis for a location
   */
  async getMarketTrendAnalysis(location: string) {
    // This would typically integrate with market analysis APIs
    // For now, returning mock data
    
    const valuations = await this.prisma.propertyValuation.findMany({
      where: {
        property: {
          location: {
            contains: location.toLowerCase(),
            mode: 'insensitive',
          },
        },
      },
      select: {
        valuationDate: true,
        estimatedValue: true,
      },
      orderBy: {
        valuationDate: 'asc',
      },
    });

    // Group by date and calculate averages manually
    const groupedByDate: { [key: string]: number[] } = {};
    for (const valuation of valuations) {
      const dateStr = valuation.valuationDate.toISOString().split('T')[0];
      if (!groupedByDate[dateStr]) {
        groupedByDate[dateStr] = [];
      }
      groupedByDate[dateStr].push(Number(valuation.estimatedValue));
    }

    const marketData = Object.entries(groupedByDate).map(([date, values]) => ({
      valuationDate: new Date(date),
      _avg: {
        estimatedValue: values.reduce((sum, val) => sum + val, 0) / values.length,
      },
    }));

    return {
      location,
      trendData: marketData.map(d => ({
        date: d.valuationDate,
        avgValue: d._avg.estimatedValue,
      })),
      trendDirection: this.calculateTrendDirection(marketData),
    };
  }

  private calculateTrendDirection(data: any[]) {
    if (data.length < 2) return 'insufficient_data';

    const firstValue = data[0]._avg.estimatedValue;
    const lastValue = data[data.length - 1]._avg.estimatedValue;

    if (firstValue && lastValue) {
      const changePercent = ((lastValue - firstValue) / firstValue) * 100;
      return changePercent > 0 ? 'upward' : changePercent < 0 ? 'downward' : 'stable';
    }

    return 'unknown';
  }
}