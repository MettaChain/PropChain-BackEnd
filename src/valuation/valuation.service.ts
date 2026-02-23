import { Injectable, Logger, NotFoundException, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma/prisma.service';
import axios from 'axios';
import { Decimal } from '@prisma/client/runtime/library';
import { CacheService } from '../common/services/cache.service';
import { withResilience } from 'src/common/utils/resilence.util';
import { PropertyFeatures, ValuationResult } from './valuation.types';
import { PrismaProperty, PrismaPropertyValuation } from '../types/prisma.types';
import { isObject, isString, isNumber } from '../types/guards';

// Remove the inline interfaces since we're importing them from valuation.types.ts

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
    private readonly cacheService: CacheService, // Inject the cache service
  ) {
    this.externalApis = {
      zillow: {
        baseUrl: 'https://api.zillow.com/v1',
        apiKey: this.configService.get('valuation.externalApi.zillowApiKey'),
      },
      redfin: {
        baseUrl: 'https://api.redfin.com/v1',
        apiKey: this.configService.get('valuation.externalApi.redfinApiKey'),
      },
      corelogic: {
        baseUrl: 'https://api.corelogic.com/v1',
        apiKey: this.configService.get('valuation.externalApi.corelogicApiKey'),
      },
    };
  }

  async getValuation(propertyId: string, features?: PropertyFeatures): Promise<ValuationResult> {
    const cacheKey = `valuation:${propertyId}`;
    const cacheTtl = this.configService.get<number>('valuation.valuation.cacheTtl', 86400); // 24 hours default

    // Try to get from cache first
    const cachedValuation = await this.cacheService.get<ValuationResult>(cacheKey);
    if (cachedValuation) {
      this.logger.log(`Cache HIT for property ${propertyId}`);
      return cachedValuation;
    }

    this.logger.log(`Cache MISS for property ${propertyId}, fetching fresh valuation`);

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

        const prop = property as PrismaProperty;
        features = {
          id: prop.id,
          location: prop.location,
          bedrooms: prop.bedrooms || 0,
          bathrooms: prop.bathrooms || 0,
          squareFootage: prop.squareFootage ? Number(prop.squareFootage) : 0,
          yearBuilt: prop.yearBuilt || new Date().getFullYear(),
          propertyType: prop.propertyType || 'residential',
          lotSize: prop.lotSize ? Number(prop.lotSize) : 0,
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
        throw new HttpException('All external valuation APIs failed', HttpStatus.SERVICE_UNAVAILABLE);
      }

      // Combine valuations using weighted average
      const combinedValuation = this.combineValuations(validValuations);

      // Save valuation to database
      const savedValuation = await this.saveValuation(combinedValuation);

      // Update property with valuation
      await this.updatePropertyWithValuation(propertyId, savedValuation);

      // Cache the result with tags for easy invalidation
      await this.cacheService.set(cacheKey, savedValuation, { ttl: cacheTtl });
      await this.cacheService.tagEntry(cacheKey, ['valuation', 'property', propertyId]);

      this.logger.log(`Successfully cached valuation for property ${propertyId}`);

      return savedValuation;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      this.logger.error(`Valuation failed for property ${propertyId}: ${errorMessage}`);
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
      const response = await axios.post(
        `${this.externalApis.zillow.baseUrl}/valuation`,
        {
          address: features.location,
          bedrooms: features.bedrooms,
          bathrooms: features.bathrooms,
          sqft: features.squareFootage,
          yearBuilt: features.yearBuilt,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: this.configService.get('valuation.valuation.timeout'),
        },
      );

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
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      this.logger.error(`Zillow API error: ${errorMessage}`);
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
      const response = await axios.post(
        `${this.externalApis.corelogic.baseUrl}/property-valuations`,
        {
          property: {
            address: features.location,
            bedrooms: features.bedrooms,
            bathrooms: features.bathrooms,
            squareFootage: features.squareFootage,
            yearBuilt: features.yearBuilt,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: this.configService.get('valuation.valuation.timeout'),
        },
      );

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
   * Normalize property features to standard format
   */
  private normalizeFeatures(features: PropertyFeatures): PropertyFeatures {
    // Normalize location: trim and lowercase
    const location = features.location ? features.location.trim().toLowerCase() : '';

    // Convert string values to numbers where appropriate
    const bedrooms = typeof features.bedrooms === 'string' ? parseInt(features.bedrooms, 10) : features.bedrooms;
    const bathrooms = typeof features.bathrooms === 'string' ? parseFloat(features.bathrooms) : features.bathrooms;
    const squareFootage =
      typeof features.squareFootage === 'string' ? parseInt(features.squareFootage, 10) : features.squareFootage;
    const yearBuilt = typeof features.yearBuilt === 'string' ? parseInt(features.yearBuilt, 10) : features.yearBuilt;
    const lotSize = typeof features.lotSize === 'string' ? parseFloat(features.lotSize) : features.lotSize;

    return {
      ...features,
      location,
      bedrooms: bedrooms || 0,
      bathrooms: bathrooms || 0,
      squareFootage: squareFootage || 0,
      yearBuilt: yearBuilt || 0,
      lotSize: lotSize || 0,
    };
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
    const trendCounts: Record<string, number> = {};
    for (const trend of trends) {
      trendCounts[trend] = (trendCounts[trend] || 0) + 1;
    }

    const trendEntries = Object.entries(trendCounts);
    if (trendEntries.length === 0) {
      return 'stable';
    }

    return trendEntries.reduce((a, b) => (a[1] > b[1] ? a : b))[0] as 'up' | 'down' | 'stable';
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
    const updateData: any = {
      valuationDate: valuation.valuationDate,
      valuationConfidence: valuation.confidenceScore,
      valuationSource: valuation.source,
      lastValuationId: valuation.propertyId,
    };

    // Only include estimatedValue if it's a number
    if (typeof valuation.estimatedValue === 'number') {
      updateData.estimatedValue = new Decimal(valuation.estimatedValue.toString());
    }

    await this.prisma.property.update({
      where: { id: propertyId },
      data: updateData,
    });

    // Invalidate related caches when property is updated
    await this.invalidateRelatedCaches(propertyId);
  }

  /**
   * Get historical valuations for a property
   */
  async getPropertyHistory(propertyId: string): Promise<ValuationResult[]> {
    const cacheKey = `valuation:history:${propertyId}`;
    const cacheTtl = this.configService.get<number>('valuation.valuation.cacheTtl', 3600); // 1 hour for history

    // Try to get from cache first
    const cachedHistory = await this.cacheService.get<ValuationResult[]>(cacheKey);
    if (cachedHistory) {
      this.logger.log(`Cache HIT for property history ${propertyId}`);
      return cachedHistory;
    }

    this.logger.log(`Cache MISS for property history ${propertyId}, fetching fresh data`);

    const valuations = await this.prisma.propertyValuation?.findMany({
      where: { propertyId },
      orderBy: { valuationDate: 'desc' },
    });

    const result = valuations.map(v => ({
      propertyId: v.propertyId,
      estimatedValue: Number(v.estimatedValue),
      confidenceScore: v.confidenceScore,
      valuationDate: v.valuationDate,
      source: v.source,
      marketTrend: v.marketTrend,
      featuresUsed: v.featuresUsed ? JSON.parse(v.featuresUsed as string) : undefined,
      rawData: v.rawData ? JSON.parse(v.rawData as string) : undefined,
    }));

    // Cache the result with tags
    await this.cacheService.set(cacheKey, result, { ttl: cacheTtl });
    await this.cacheService.tagEntry(cacheKey, ['valuation-history', 'property', propertyId]);

    return result;
  }

  /**
   * Get market trend analysis for a location
   */
  async getMarketTrendAnalysis(location: string) {
    // This would typically integrate with market analysis APIs
    // For now, returning mock data

    const valuations = await this.prisma.propertyValuation?.findMany({
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

  private calculateTrendDirection(marketData: any[]): 'up' | 'down' | 'stable' {
    if (marketData.length < 2) {
      return 'stable';
    }

    const first = marketData[0]._avg.estimatedValue;
    const last = marketData[marketData.length - 1]._avg.estimatedValue;

    const change = ((last - first) / first) * 100;

    if (change > 5) {
      return 'up';
    }
    if (change < -5) {
      return 'down';
    }
    return 'stable';
  }

  /**
   * Invalidate cache for a specific property valuation and related caches
   */
  async invalidatePropertyCache(propertyId: string): Promise<void> {
    const cacheKey = `valuation:${propertyId}`;

    // Invalidate with cascade to handle dependent caches
    await this.cacheService.invalidateWithCascade(cacheKey);

    this.logger.log(`Invalidated cache for property ${propertyId} with cascade`);
  }

  /**
   * Invalidate related caches when property is updated
   */
  private async invalidateRelatedCaches(propertyId: string): Promise<void> {
    // Invalidate property-related caches
    await this.cacheService.invalidateByPattern(`property:${propertyId}*`);
    await this.cacheService.invalidateByPattern(`valuation:${propertyId}*`);
    await this.cacheService.invalidateByPattern(`document:property:${propertyId}*`);

    this.logger.log(`Invalidated related caches for property ${propertyId}`);
  }

  /**
   * Get cache metrics for valuations
   */
  getValuationCacheMetrics() {
    return this.cacheService.getMetrics('valuation');
  }

  /**
   * Invalidate all valuations for a specific location
   */
  async invalidateLocationValuations(location: string): Promise<void> {
    // Invalidate all valuations for properties in this location
    await this.cacheService.invalidateByPattern(`valuation:*${location}*`);
    await this.cacheService.invalidateByPattern(`valuation:history:*${location}*`);

    this.logger.log(`Invalidated valuations for location: ${location}`);
  }

  /**
   * Conditional invalidation based on valuation thresholds
   */
  async conditionallyInvalidateValuations(condition: (value: any) => boolean): Promise<void> {
    await this.cacheService.conditionalInvalidate('valuation:*', condition);
    this.logger.log('Conditionally invalidated valuations based on provided condition');
  }

  /**
   * Warm cache with frequently accessed property valuations
   */
  async warmValuationCache(): Promise<void> {
    this.logger.log('Starting valuation cache warming process');

    // Identify frequently accessed properties (e.g., recently viewed, popular locations)
    const frequentlyAccessedProperties = await this.getFrequentlyAccessedProperties();

    const warmupTasks = frequentlyAccessedProperties.map(property => ({
      key: `valuation:${property.id}`,
      factory: () => this.getFreshValuation(property.id, property),
      options: { ttl: this.configService.get<number>('valuation.valuation.cacheTtl', 86400) },
      condition: () => true, // Always run warming for these properties
    }));

    await this.cacheService.warmCache(warmupTasks);

    this.logger.log(
      `Completed warming cache for ${frequentlyAccessedProperties.length} frequently accessed properties`,
    );
  }

  /**
   * Warm cache with recent property valuations
   */
  async warmRecentValuations(): Promise<void> {
    this.logger.log('Starting recent valuations cache warming');

    // Get recently valued properties
    const recentProperties = await this.getRecentValuedProperties();

    const warmupTasks = recentProperties.map(property => ({
      key: `valuation:history:${property.propertyId}`,
      factory: () => this.getPropertyHistory(property.propertyId),
      options: { ttl: this.configService.get<number>('valuation.history.cacheTtl', 3600) },
      condition: () => true,
    }));

    await this.cacheService.warmCache(warmupTasks);

    this.logger.log(`Completed warming cache for ${recentProperties.length} recent valuations`);
  }

  /**
   * Get frequently accessed properties based on access logs or analytics
   */
  private async getFrequentlyAccessedProperties(limit: number = 10): Promise<any[]> {
    // In a real implementation, this would query analytics/access logs
    // For now, we'll return recently created properties as a proxy for frequently accessed
    try {
      const properties = await this.prisma.property.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          location: true,
          bedrooms: true,
          bathrooms: true,
          squareFootage: true,
          yearBuilt: true,
          propertyType: true,
          lotSize: true,
        },
      });

      return properties;
    } catch (error) {
      this.logger.error(`Failed to get frequently accessed properties: ${error.message}`);
      return [];
    }
  }

  /**
   * Get recently valued properties
   */
  private async getRecentValuedProperties(limit: number = 10): Promise<Array<{ propertyId: string }>> {
    try {
      const recentValuations = await this.prisma.propertyValuation?.findMany({
        orderBy: { valuationDate: 'desc' },
        take: limit,
        select: {
          propertyId: true,
        },
        distinct: ['propertyId'], // Get unique property IDs
      });

      return recentValuations;
    } catch (error) {
      this.logger.error(`Failed to get recent valued properties: ${error.message}`);
      return [];
    }
  }

  /**
   * Get fresh valuation without using cache
   */
  private async getFreshValuation(propertyId: string, features?: PropertyFeatures): Promise<ValuationResult> {
    this.logger.log(`Fetching fresh valuation for property ${propertyId} (bypassing cache)`);

    try {
      // Get property from database if features not provided
      if (!features) {
        const property = await this.prisma.property.findUnique({
          where: { id: propertyId },
        });

        if (!property) {
          throw new NotFoundException(`Property with ID ${propertyId} not found`);
        }

        const prop = property as PrismaProperty;
        features = {
          id: prop.id,
          location: prop.location,
          bedrooms: prop.bedrooms || 0,
          bathrooms: prop.bathrooms || 0,
          squareFootage: prop.squareFootage ? Number(prop.squareFootage) : 0,
          yearBuilt: prop.yearBuilt || new Date().getFullYear(),
          propertyType: prop.propertyType || 'residential',
          lotSize: prop.lotSize ? Number(prop.lotSize) : 0,
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
        throw new HttpException('All external valuation APIs failed', HttpStatus.SERVICE_UNAVAILABLE);
      }

      // Combine valuations using weighted average
      const combinedValuation = this.combineValuations(validValuations);

      // Save valuation to database
      const savedValuation = await this.saveValuation(combinedValuation);

      // Update property with valuation
      await this.updatePropertyWithValuation(propertyId, savedValuation);

      return savedValuation;
    } catch (error) {
      this.logger.error(`Fresh valuation failed for property ${propertyId}: ${error.message}`);
      throw error;
    }
  }

  async getPropertyValuation(propertyId: string) {
    return withResilience(() => this.callExternalValuationApi(propertyId), {
      name: 'ValuationAPI',
      retries: 3,
      fallback: async err => {
        this.logger.warn(`Valuation API failed for ${propertyId}, using fallback. Error: ${err.message}`);
        const lastPrice = await this.prisma.propertyValuation.findFirst({
          where: { propertyId },
          orderBy: { createdAt: 'desc' },
        });
        return lastPrice || { value: 0, status: 'ESTIMATED' };
      },
    });
  }

  private async callExternalValuationApi(propertyId: string) {
    const apiKey = this.configService.get<string>('VALUATION_API_KEY');
    const apiUrl = this.configService.get<string>('VALUATION_API_URL');

    const response = await axios.get(`${apiUrl}/valuation/${propertyId}`, {
      headers: { 'X-API-KEY': apiKey },
    });

    return response.data;
  }
}
