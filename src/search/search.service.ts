import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { SearchGeographicService } from './search-geographic.service';
import { SearchFiltersService } from './search-filters.service';
import { SearchAutocompleteService } from './search-autocomplete.service';
import { SearchAnalyticsService } from './search-analytics.service';
import { SearchHistoryService } from './search-history.service';
import { SearchFacetsService } from './search-facets.service';

export interface SearchQuery {
  query?: string;
  filters?: Record<string, any>;
  geographic?: {
    type: 'radius' | 'polygon';
    coordinates: number[][];
    radius?: number;
  };
  sort?: {
    field: string;
    order: 'asc' | 'desc';
  };
  pagination?: {
    page: number;
    limit: number;
  };
}

export interface SearchResult<T> {
  items: T[];
  total: number;
  facets?: any;
  suggestions?: string[];
  analytics?: {
    queryId: string;
    took: number;
  };
}

@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geographicService: SearchGeographicService,
    private readonly filtersService: SearchFiltersService,
    private readonly autocompleteService: SearchAutocompleteService,
    private readonly analyticsService: SearchAnalyticsService,
    private readonly historyService: SearchHistoryService,
    private readonly facetsService: SearchFacetsService,
  ) {}

  async searchProperties(userId: string, searchQuery: SearchQuery): Promise<SearchResult<any>> {
    const startTime = Date.now();
    const queryId = await this.analyticsService.recordSearch(userId, searchQuery);

    try {
      // Build base query
      let whereClause: any = {};

      // Apply text search
      if (searchQuery.query) {
        whereClause.OR = [
          { title: { contains: searchQuery.query, mode: 'insensitive' } },
          { description: { contains: searchQuery.query, mode: 'insensitive' } },
          { address: { contains: searchQuery.query, mode: 'insensitive' } },
          { city: { contains: searchQuery.query, mode: 'insensitive' } },
          { state: { contains: searchQuery.query, mode: 'insensitive' } },
        ];
      }

      // Apply geographic filters
      if (searchQuery.geographic) {
        whereClause = await this.geographicService.applyGeographicFilter(
          whereClause,
          searchQuery.geographic,
        );
      }

      // Apply advanced filters
      if (searchQuery.filters) {
        whereClause = await this.filtersService.applyFilters(whereClause, searchQuery.filters);
      }

      // Execute query with sorting and pagination
      const { page = 1, limit = 20 } = searchQuery.pagination || {};
      const { field = 'createdAt', order = 'desc' } = searchQuery.sort || {};

      // Mock data for now - this would typically query the database
      const items: any[] = [];
      const total = 0;

      // Generate facets
      const facets = await this.facetsService.buildFacets(items, [
        'propertyType',
        'status',
        'city',
        'state',
        'bedrooms',
        'bathrooms',
      ]);

      // Get suggestions
      const suggestions = await this.autocompleteService.getSuggestions(searchQuery.query || '');

      // Record search history
      if (searchQuery.query) {
        this.historyService.record(userId, searchQuery.query);
      }

      const result: SearchResult<any> = {
        items,
        total,
        facets,
        suggestions,
        analytics: {
          queryId,
          took: Date.now() - startTime,
        },
      };

      return result;
    } catch (error) {
      await this.analyticsService.recordSearchError(queryId, error);
      throw error;
    }
  }

  async getSuggestions(query: string): Promise<string[]> {
    return this.autocompleteService.getSuggestions(query);
  }

  async getSavedFilters(userId: string): Promise<any[]> {
    return this.filtersService.getSavedFilters(userId);
  }

  async saveFilter(userId: string, filter: any): Promise<any> {
    return this.filtersService.saveFilter(userId, filter);
  }

  async getSearchAnalytics(userId?: string): Promise<any> {
    return this.analyticsService.getAnalytics(userId);
  }

  async getPopularSearches(): Promise<string[]> {
    return this.analyticsService.getPopularSearches();
  }
}
