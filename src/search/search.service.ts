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

  async searchProperties(
    userId: string,
    searchQuery: SearchQuery,
  ): Promise<SearchResult<any>> {
    const startTime = Date.now();
    const queryId = await this.analyticsService.recordSearch(userId, searchQuery);

    try {
      let whereClause: any = {};

      if (searchQuery.query) {
        whereClause.OR = [
          { title: { contains: searchQuery.query, mode: 'insensitive' } },
          { description: { contains: searchQuery.query, mode: 'insensitive' } },
          { address: { contains: searchQuery.query, mode: 'insensitive' } },
          { city: { contains: searchQuery.query, mode: 'insensitive' } },
          { state: { contains: searchQuery.query, mode: 'insensitive' } },
        ];
      }

      if (searchQuery.geographic) {
        whereClause = await this.geographicService.applyGeographicFilter(
          whereClause,
          searchQuery.geographic,
        );
      }

      if (searchQuery.filters) {
        whereClause = await this.filtersService.applyFilters(
          whereClause,
          searchQuery.filters,
        );
      }

      const { page = 1, limit = 20 } = searchQuery.pagination || {};
      const { field = 'createdAt', order = 'desc' } = searchQuery.sort || {};

      const items: any[] = await this.prisma.property.findMany({
        where: whereClause,
        orderBy: { [field]: order },
        skip: (page - 1) * limit,
        take: limit,
      });

      const total = await this.prisma.property.count({ where: whereClause });

      const facets = await this.facetsService.buildFacets(items, [
        'propertyType',
        'status',
        'city',
        'state',
        'bedrooms',
        'bathrooms',
      ]);

      const suggestions = await this.autocompleteService.getSuggestions(
        searchQuery.query || '',
      );

      if (searchQuery.query) {
        this.historyService.record(userId, searchQuery.query);
      }

      return {
        items,
        total,
        facets,
        suggestions,
        analytics: {
          queryId,
          took: Date.now() - startTime,
        },
      };
    } catch (error) {
      await this.analyticsService.recordSearchError(queryId, error);
      throw error;
    }
  }

  // PostgreSQL full-text search for projects
  async searchProjects(query: string, filters?: any) {
    return this.prisma.$queryRaw`
      SELECT id, title, description,
             ts_rank_cd(to_tsvector('english', title || ' ' || description), plainto_tsquery(${query})) AS rank
      FROM "Project"
      WHERE to_tsvector('english', title || ' ' || description) @@ plainto_tsquery(${query})
      ORDER BY rank DESC
      LIMIT 20;
    `;
  }

  async suggestTerms(query: string) {
    return this.prisma.$queryRaw`
      SELECT word
      FROM ts_stat('SELECT to_tsvector(''english'', title || '' '' || description) FROM "Project"')
      WHERE word LIKE ${query || ''} || '%'
      ORDER BY nentry DESC
      LIMIT 5;
    `;
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
