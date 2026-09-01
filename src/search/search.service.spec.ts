import { Test, TestingModule } from '@nestjs/testing';
import { SearchService } from './search.service';
import { PrismaService } from '../database/prisma.service';
import { SearchGeographicService } from './search-geographic.service';
import { SearchFiltersService } from './search-filters.service';
import { SearchAutocompleteService } from './search-autocomplete.service';
import { SearchAnalyticsService } from './search-analytics.service';
import { SearchHistoryService } from './search-history.service';
import { SearchFacetsService } from './search-facets.service';

describe('SearchService', () => {
  let service: SearchService;
  let prisma: { property: { findMany: jest.Mock } };
  let geographicService: jest.Mocked<Partial<SearchGeographicService>>;
  let filtersService: jest.Mocked<Partial<SearchFiltersService>>;
  let autocompleteService: jest.Mocked<Partial<SearchAutocompleteService>>;
  let analyticsService: jest.Mocked<Partial<SearchAnalyticsService>>;
  let historyService: jest.Mocked<Partial<SearchHistoryService>>;
  let facetsService: jest.Mocked<Partial<SearchFacetsService>>;

  beforeEach(async () => {
    prisma = { property: { findMany: jest.fn().mockResolvedValue([]) } };
    geographicService = {
      applyGeographicFilter: jest.fn().mockResolvedValue({}),
    };
    filtersService = {
      applyFilters: jest.fn().mockResolvedValue({}),
      getSavedFilters: jest.fn().mockResolvedValue([]),
      saveFilter: jest.fn().mockResolvedValue({ id: '1' }),
    };
    autocompleteService = {
      getSuggestions: jest.fn().mockResolvedValue(['suggestion1']),
    };
    analyticsService = {
      recordSearch: jest.fn().mockResolvedValue('query-id-1'),
      recordSearchError: jest.fn().mockResolvedValue(undefined),
      getAnalytics: jest.fn().mockResolvedValue({ totalSearches: 0 }),
      getPopularSearches: jest.fn().mockResolvedValue(['popular']),
    };
    historyService = {
      record: jest.fn().mockResolvedValue(undefined),
    };
    facetsService = {
      buildFacets: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        { provide: PrismaService, useValue: prisma },
        { provide: SearchGeographicService, useValue: geographicService },
        { provide: SearchFiltersService, useValue: filtersService },
        { provide: SearchAutocompleteService, useValue: autocompleteService },
        { provide: SearchAnalyticsService, useValue: analyticsService },
        { provide: SearchHistoryService, useValue: historyService },
        { provide: SearchFacetsService, useValue: facetsService },
      ],
    }).compile();

    service = module.get<SearchService>(SearchService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('searchProperties', () => {
    it('should return search results with facets and suggestions', async () => {
      const result = await service.searchProperties('user-1', {
        query: 'test',
      });

      expect(result).toBeDefined();
      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
      expect(analyticsService.recordSearch).toHaveBeenCalledWith('user-1', { query: 'test' });
      expect(autocompleteService.getSuggestions).toHaveBeenCalledWith('test');
    });

    it('should apply geographic filters when provided', async () => {
      await service.searchProperties('user-1', {
        geographic: { type: 'radius', coordinates: [[0, 0]], radius: 5000 },
      });

      expect(geographicService.applyGeographicFilter).toHaveBeenCalled();
    });

    it('should apply advanced filters when provided', async () => {
      await service.searchProperties('user-1', {
        filters: { minPrice: 100000, maxPrice: 500000 },
      });

      expect(filtersService.applyFilters).toHaveBeenCalled();
    });

    it('should record search history for text queries', async () => {
      await service.searchProperties('user-1', { query: 'house' });

      expect(historyService.record).toHaveBeenCalledWith('user-1', 'house');
    });

    it('should not record search history for empty queries', async () => {
      await service.searchProperties('user-1', {});

      expect(historyService.record).not.toHaveBeenCalled();
    });

    it('should record analytics error on failure', async () => {
      jest
        .spyOn(analyticsService, 'recordSearch')
        .mockRejectedValueOnce(new Error('analytics fail'));

      await expect(service.searchProperties('user-1', { query: 'test' })).rejects.toThrow(
        'analytics fail',
      );
    });
  });

  describe('getSuggestions', () => {
    it('should delegate to autocomplete service', async () => {
      const result = await service.getSuggestions('test');
      expect(result).toEqual(['suggestion1']);
      expect(autocompleteService.getSuggestions).toHaveBeenCalledWith('test');
    });
  });

  describe('getSavedFilters', () => {
    it('should delegate to filters service', async () => {
      const result = await service.getSavedFilters('user-1');
      expect(result).toEqual([]);
      expect(filtersService.getSavedFilters).toHaveBeenCalledWith('user-1');
    });
  });

  describe('saveFilter', () => {
    it('should delegate to filters service', async () => {
      const result = await service.saveFilter('user-1', { name: 'My Filter' });
      expect(result).toEqual({ id: '1' });
      expect(filtersService.saveFilter).toHaveBeenCalledWith('user-1', { name: 'My Filter' });
    });
  });

  describe('getSearchAnalytics', () => {
    it('should delegate to analytics service', async () => {
      const result = await service.getSearchAnalytics('user-1');
      expect(result).toEqual({ totalSearches: 0 });
      expect(analyticsService.getAnalytics).toHaveBeenCalledWith('user-1');
    });
  });

  describe('getPopularSearches', () => {
    it('should delegate to analytics service', async () => {
      const result = await service.getPopularSearches();
      expect(result).toEqual(['popular']);
      expect(analyticsService.getPopularSearches).toHaveBeenCalled();
    });
  });
});
