import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export interface Suggestion {
  text: string;
  type: 'property' | 'location' | 'feature' | 'recent' | 'popular';
  count?: number;
  metadata?: any;
}

@Injectable()
export class SearchAutocompleteService {
  constructor(private readonly prisma: PrismaService) {}

  async getSuggestions(query: string, limit: number = 10): Promise<string[]> {
    if (!query || query.length < 2) {
      return [];
    }

    const suggestions: Suggestion[] = [];

    // Get property suggestions
    const propertySuggestions = await this.getPropertySuggestions(query, 3);
    suggestions.push(...propertySuggestions);

    // Get location suggestions
    const locationSuggestions = await this.getLocationSuggestions(query, 3);
    suggestions.push(...locationSuggestions);

    // Get feature suggestions
    const featureSuggestions = await this.getFeatureSuggestions(query, 2);
    suggestions.push(...featureSuggestions);

    // Get recent searches
    const recentSuggestions = await this.getRecentSearchSuggestions(query, 1);
    suggestions.push(...recentSuggestions);

    // Get popular searches
    const popularSuggestions = await this.getPopularSearchSuggestions(query, 1);
    suggestions.push(...popularSuggestions);

    // Sort by relevance and limit
    const sortedSuggestions = this.rankSuggestions(suggestions, query)
      .slice(0, limit)
      .map((s) => s.text);

    return sortedSuggestions;
  }

  private async getPropertySuggestions(query: string, limit: number): Promise<Suggestion[]> {
    // This would typically query the property table
    // For now, return mock data
    return [];
  }

  private async getLocationSuggestions(query: string, limit: number): Promise<Suggestion[]> {
    // This would typically query the property table for locations
    // For now, return mock data
    return [];
  }

  private async getFeatureSuggestions(query: string, limit: number): Promise<Suggestion[]> {
    const features = [
      'pool',
      'garage',
      'garden',
      'balcony',
      'fireplace',
      'basement',
      'patio',
      'deck',
    ];

    const matchingFeatures = features
      .filter((feature) => feature.toLowerCase().includes(query.toLowerCase()))
      .slice(0, limit);

    return matchingFeatures.map((feature) => ({
      text: feature,
      type: 'feature',
    }));
  }

  private async getRecentSearchSuggestions(query: string, limit: number): Promise<Suggestion[]> {
    // This would typically query a search history table
    // For now, return empty array
    return [];
  }

  private async getPopularSearchSuggestions(query: string, limit: number): Promise<Suggestion[]> {
    // This would typically query search analytics
    // For now, return empty array
    return [];
  }

  private rankSuggestions(suggestions: Suggestion[], query: string): Suggestion[] {
    const queryLower = query.toLowerCase();

    return suggestions.sort((a, b) => {
      // Exact matches first
      const aExact = a.text.toLowerCase() === queryLower;
      const bExact = b.text.toLowerCase() === queryLower;
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;

      // Starts with query
      const aStarts = a.text.toLowerCase().startsWith(queryLower);
      const bStarts = b.text.toLowerCase().startsWith(queryLower);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;

      // Type priority: location > property > feature > popular > recent
      const typePriority = {
        location: 5,
        property: 4,
        feature: 3,
        popular: 2,
        recent: 1,
      };

      const aPriority = typePriority[a.type] || 0;
      const bPriority = typePriority[b.type] || 0;
      if (aPriority !== bPriority) {
        return bPriority - aPriority;
      }

      // Alphabetical order as final tiebreaker
      return a.text.localeCompare(b.text);
    });
  }

  async getTypoCorrectedSuggestions(query: string): Promise<string[]> {
    if (!query || query.length < 3) {
      return [];
    }

    const suggestions = await this.getSuggestions(query);

    if (suggestions.length > 0) {
      return suggestions;
    }

    // Try common typo corrections
    const corrections = this.getCommonTypoCorrections(query);

    for (const correction of corrections) {
      const correctedSuggestions = await this.getSuggestions(correction);
      if (correctedSuggestions.length > 0) {
        return correctedSuggestions;
      }
    }

    return [];
  }

  private getCommonTypoCorrections(query: string): string[] {
    const corrections: string[] = [];

    // Common property-related typos
    const typoMap: Record<string, string[]> = {
      apartment: ['apartmant', 'apartmet', 'apartmen'],
      house: ['hous', 'hose'],
      condo: ['condo', 'condo'],
      garage: ['garage', 'garage'],
      bedroom: ['bedrom', 'bedrum', 'bedroom'],
      bathroom: ['bathrom', 'bathrum', 'bathroom'],
      pool: ['pol', 'pool'],
      garden: ['garden', 'garden'],
    };

    for (const [correct, typos] of Object.entries(typoMap)) {
      if (typos.includes(query.toLowerCase())) {
        corrections.push(correct);
      }
    }

    // Simple character swaps and deletions
    if (query.length > 3) {
      for (let i = 0; i < query.length - 1; i++) {
        // Swap adjacent characters
        const swapped = query.slice(0, i) + query[i + 1] + query[i] + query.slice(i + 2);
        corrections.push(swapped);

        // Delete character
        const deleted = query.slice(0, i) + query.slice(i + 1);
        corrections.push(deleted);
      }
    }

    return corrections;
  }

  async recordSuggestionClick(suggestion: string, userId: string): Promise<void> {
    // Record analytics for suggestion clicks
    // This would typically update a search analytics table
  }

  async getPopularSearches(limit: number = 10): Promise<string[]> {
    // This would typically query search analytics
    // For now, return some common searches
    const popularSearches = [
      'house for sale',
      'apartment for rent',
      '3 bedroom house',
      'pool house',
      'garage apartment',
      'condo downtown',
      'townhouse with garden',
      'luxury property',
      'investment property',
      'first home',
    ].slice(0, limit);

    return popularSearches;
  }

  async getRecentSearches(userId: string, limit: number = 5): Promise<string[]> {
    // This would typically query search history
    // For now, return empty array
    const recentSearches: string[] = [];

    return recentSearches;
  }
}
