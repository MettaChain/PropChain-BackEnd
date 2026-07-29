// @ts-nocheck

/**
 * Search Autocomplete Service
 *
 * Provides real-time, debounced suggestions as the user types.
 * Suggestions are sourced from four channels and returned grouped by type:
 *   - property  : matches on property title/address
 *   - location  : unique city/state/zip combinations
 *   - feature   : built-in feature keywords (pool, garage …)
 *   - recent    : the authenticated user's own search history
 *   - popular   : globally trending searches (PopularSearch model)
 *
 * Personalised ranking: the user's own recent searches are boosted
 * so they appear first among equal-relevance candidates.
 *
 * Minimum query length: 2 characters.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { SearchHistoryService } from './search-history.service';

export interface Suggestion {
  text: string;
  type: 'property' | 'location' | 'feature' | 'recent' | 'popular';
  count?: number;
  metadata?: Record<string, unknown>;
}

/** Minimum characters before suggestions are fetched */
const MIN_QUERY_LENGTH = 2;

@Injectable()
export class SearchAutocompleteService {
  private readonly logger = new Logger(SearchAutocompleteService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly searchHistoryService: SearchHistoryService,
  ) {}

  /**
   * Get autocomplete suggestions for a partial query.
   *
   * @param query   – the current input value (debounced client-side)
   * @param userId  – optional authenticated user id for personalisation
   * @param limit   – max suggestions to return (default 10)
   * @returns grouped suggestion array
   */
  async getSuggestions(query: string, limit: number = 10, userId?: string): Promise<Suggestion[]> {
    if (!query || query.length < MIN_QUERY_LENGTH) {
      return [];
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const queryLower = query.toLowerCase();
    const suggestions: Suggestion[] = [];

    const [propertyResults, locationResults, featureResults, recentResults, popularResults] =
      await Promise.all([
        this.getPropertySuggestions(query, Math.ceil(limit * 0.25)),
        this.getLocationSuggestions(query, Math.ceil(limit * 0.25)),
        this.getFeatureSuggestions(query, Math.ceil(limit * 0.15)),
        this.getRecentSearchSuggestions(query, userId, Math.ceil(limit * 0.2)),
        this.getPopularSearchSuggestions(query, Math.ceil(limit * 0.15)),
      ]);

    suggestions.push(
      ...propertyResults,
      ...locationResults,
      ...featureResults,
      ...recentResults,
      ...popularResults,
    );

    return this.rankSuggestions(suggestions, query, userId).slice(0, limit);
  }

  /**
   * Property title / address suggestions via Prisma.
   */
  private async getPropertySuggestions(query: string, limit: number): Promise<Suggestion[]> {
    try {
      const properties = await (this.prisma as any).property.findMany({
        where: {
          deleted: false,
          OR: [
            { title: { contains: query, mode: 'insensitive' } },
            { address: { contains: query, mode: 'insensitive' } },
          ],
        },
        select: { id: true, title: true, address: true, city: true, state: true },
        take: limit,
      });

      return properties.map((p: any) => ({
        text: p.title || p.address,
        type: 'property' as const,
        metadata: { id: p.id, city: p.city, state: p.state },
      }));
    } catch (error) {
      this.logger.warn('Property suggestion query failed, falling back to empty', error);
      return [];
    }
  }

  /**
   * Location suggestions derived from unique city/state/zips.
   */
  private async getLocationSuggestions(query: string, limit: number): Promise<Suggestion[]> {
    try {
      const rows = await (this.prisma as any).$queryRaw`
        SELECT DISTINCT city, state, zip_code
        FROM properties
        WHERE deleted = false
          AND (
            city ILIKE ${'%' + query + '%'}
            OR state ILIKE ${'%' + query + '%'}
            OR zip_code ILIKE ${'%' + query + '%'}
          )
        LIMIT ${limit}
      `;

      return rows.map((r: any) => ({
        text: `${r.city}, ${r.state} ${r.zip_code}`.trim(),
        type: 'location' as const,
      }));
    } catch (error) {
      this.logger.warn('Location suggestion query failed, falling back to empty', error);
      return [];
    }
  }

  /**
   * Feature keyword suggestions from a curated list.
   */
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
      'gym',
      'doorman',
      'elevator',
      'laundry',
      'rooftop',
      'storage',
      'parking',
      'smart home',
      'solar panels',
      'wine cellar',
      'home office',
      'walk-in closet',
    ];

    return features
      .filter((f) => f.toLowerCase().includes(query.toLowerCase()))
      .slice(0, limit)
      .map((f) => ({ text: f, type: 'feature' as const }));
  }

  /**
   * Recent search suggestions – personalised from the user's own history.
   * Uses Prisma SearchHistory model for persistence, falls back to
   * the in-memory SearchHistoryService.
   */
  private async getRecentSearchSuggestions(
    query: string,
    userId: string | undefined,
    limit: number,
  ): Promise<Suggestion[]> {
    if (!userId) return [];

    try {
      const history = await (this.prisma as any).searchHistory.findMany({
        where: {
          userId,
          query: { contains: query, mode: 'insensitive' },
        },
        orderBy: { lastSearched: 'desc' },
        take: limit,
      });

      return history.map((h: any) => ({
        text: h.query,
        type: 'recent' as const,
        count: h.frequency,
        metadata: { lastSearched: h.lastSearched },
      }));
    } catch (error) {
      this.logger.warn('SearchHistory query failed, falling back to in-memory history', error);
      const inMemory = this.searchHistoryService.getHistory(userId);
      return inMemory
        .filter((e) => e.query.toLowerCase().includes(query.toLowerCase()))
        .slice(0, limit)
        .map((e) => ({ text: e.query, type: 'recent' as const }));
    }
  }

  /**
   * Popular / trending search suggestions from the PopularSearch model.
   */
  private async getPopularSearchSuggestions(query: string, limit: number): Promise<Suggestion[]> {
    try {
      const popular = await (this.prisma as any).popularSearch.findMany({
        where: {
          query: { contains: query, mode: 'insensitive' },
        },
        orderBy: [{ frequency: 'desc' }, { lastUpdated: 'desc' }],
        take: limit,
      });

      return popular.map((p: any) => ({
        text: p.query,
        type: 'popular' as const,
        count: p.frequency,
        metadata: { trend: p.trend },
      }));
    } catch (error) {
      this.logger.warn('PopularSearch query failed, falling back to empty', error);
      return [];
    }
  }

  /**
   * Rank suggestions: exact > starts-with > type priority, with user's own
   * recent searches boosted to the top among equal matches.
   */
  private rankSuggestions(suggestions: Suggestion[], query: string, userId?: string): Suggestion[] {
    const queryLower = query.toLowerCase();

    const typePriority: Record<string, number> = {
      recent: 6,
      location: 5,
      property: 4,
      popular: 3,
      feature: 2,
    };

    // Deduplicate by text (keep first occurrence, which is usually highest priority)
    const seen = new Set<string>();
    const unique = suggestions.filter((s) => {
      const key = s.text.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return unique.sort((a, b) => {
      const aExact = a.text.toLowerCase() === queryLower;
      const bExact = b.text.toLowerCase() === queryLower;
      if (aExact !== bExact) return aExact ? -1 : 1;

      const aStarts = a.text.toLowerCase().startsWith(queryLower);
      const bStarts = b.text.toLowerCase().startsWith(queryLower);
      if (aStarts !== bStarts) return aStarts ? -1 : 1;

      const aPri = typePriority[a.type] ?? 0;
      const bPri = typePriority[b.type] ?? 0;
      if (aPri !== bPri) return bPri - aPri;

      // Boost user's own recent searches
      if (userId) {
        if (a.type === 'recent' && b.type !== 'recent') return -1;
        if (a.type !== 'recent' && b.type === 'recent') return 1;
      }

      // Alphabetical tiebreaker
      return a.text.localeCompare(b.text);
    });
  }

  async getTypoCorrectedSuggestions(query: string): Promise<string[]> {
    if (!query || query.length < 3) {
      return [];
    }

    const suggestions = await this.getSuggestions(query);
    if (suggestions.length > 0) {
      return suggestions.map((s) => s.text);
    }

    const corrections = this.getCommonTypoCorrections(query);
    for (const correction of corrections) {
      const correctedSuggestions = await this.getSuggestions(correction);
      if (correctedSuggestions.length > 0) {
        return correctedSuggestions.map((s) => s.text);
      }
    }

    return [];
  }

  private getCommonTypoCorrections(query: string): string[] {
    const corrections: string[] = [];

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

    if (query.length > 3) {
      for (let i = 0; i < query.length - 1; i++) {
        const swapped = query.slice(0, i) + query[i + 1] + query[i] + query.slice(i + 2);
        corrections.push(swapped);
        const deleted = query.slice(0, i) + query.slice(i + 1);
        corrections.push(deleted);
      }
    }

    return corrections;
  }

  async recordSuggestionClick(suggestion: string, userId: string): Promise<void> {
    try {
      await (this.prisma as any).searchHistory.upsert({
        where: { userId_query: { userId, query: suggestion } },
        update: { frequency: { increment: 1 }, lastSearched: new Date() },
        create: { userId, query: suggestion, frequency: 1 },
      });

      await (this.prisma as any).popularSearch.upsert({
        where: { query: suggestion },
        update: { frequency: { increment: 1 }, lastUpdated: new Date() },
        create: { query: suggestion, frequency: 1, trend: 'stable' },
      });
    } catch (error) {
      this.logger.warn('Failed to record suggestion click', error);
    }
  }

  async getPopularSearches(limit: number = 10): Promise<string[]> {
    try {
      const rows = await (this.prisma as any).popularSearch.findMany({
        orderBy: { frequency: 'desc' },
        take: limit,
        select: { query: true },
      });
      return rows.map((r: any) => r.query);
    } catch {
      return [
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
    }
  }

  async getRecentSearches(userId: string, limit: number = 5): Promise<string[]> {
    try {
      const rows = await (this.prisma as any).searchHistory.findMany({
        where: { userId },
        orderBy: { lastSearched: 'desc' },
        take: limit,
        select: { query: true },
      });
      return rows.map((r: any) => r.query);
    } catch {
      return this.searchHistoryService
        .getHistory(userId)
        .map((e) => e.query)
        .slice(0, limit);
    }
  }
}
