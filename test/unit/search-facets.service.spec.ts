import { Test, TestingModule } from '@nestjs/testing';
import { SearchFacetsService } from '../../src/search/search-facets.service';

describe('SearchFacetsService', () => {
  let service: SearchFacetsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SearchFacetsService],
    }).compile();

    service = module.get(SearchFacetsService);
  });

  describe('buildFacets', () => {
    it('should return empty facets for empty items array', () => {
      const result = service.buildFacets([], ['propertyType', 'status']);
      expect(result).toEqual([
        { field: 'propertyType', values: [] },
        { field: 'status', values: [] },
      ]);
    });

    it('should count occurrences of each value for a single field', () => {
      const items = [
        { propertyType: 'House' },
        { propertyType: 'Condo' },
        { propertyType: 'House' },
        { propertyType: 'House' },
      ];

      const result = service.buildFacets(items, ['propertyType']);

      expect(result).toEqual([
        {
          field: 'propertyType',
          values: [
            { value: 'House', count: 3 },
            { value: 'Condo', count: 1 },
          ],
        },
      ]);
    });

    it('should sort facet values by count descending', () => {
      const items = [
        { status: 'ACTIVE' },
        { status: 'SOLD' },
        { status: 'SOLD' },
        { status: 'PENDING' },
        { status: 'SOLD' },
      ];

      const result = service.buildFacets(items, ['status']);

      expect(result[0].values).toEqual([
        { value: 'SOLD', count: 3 },
        { value: 'ACTIVE', count: 1 },
        { value: 'PENDING', count: 1 },
      ]);
    });

    it('should handle multiple fields independently', () => {
      const items = [
        { propertyType: 'House', city: 'Austin' },
        { propertyType: 'Condo', city: 'Austin' },
        { propertyType: 'House', city: 'Denver' },
      ];

      const result = service.buildFacets(items, ['propertyType', 'city']);

      expect(result).toEqual([
        {
          field: 'propertyType',
          values: [
            { value: 'House', count: 2 },
            { value: 'Condo', count: 1 },
          ],
        },
        {
          field: 'city',
          values: [
            { value: 'Austin', count: 2 },
            { value: 'Denver', count: 1 },
          ],
        },
      ]);
    });

    it('should skip null and undefined values', () => {
      const items = [
        { propertyType: 'House' },
        { propertyType: null },
        { propertyType: undefined },
        { propertyType: 'Condo' },
      ];

      const result = service.buildFacets(items, ['propertyType']);

      expect(result[0].values).toEqual([
        { value: 'House', count: 1 },
        { value: 'Condo', count: 1 },
      ]);
    });

    it('should coerce numeric values to strings', () => {
      const items = [{ bedrooms: 3 }, { bedrooms: 2 }, { bedrooms: 3 }];

      const result = service.buildFacets(items, ['bedrooms']);

      expect(result[0].values).toEqual([
        { value: '3', count: 2 },
        { value: '2', count: 1 },
      ]);
    });

    it('should coerce boolean values to strings', () => {
      const items = [{ hasPool: true }, { hasPool: false }, { hasPool: true }];

      const result = service.buildFacets(items, ['hasPool']);

      expect(result[0].values).toEqual([
        { value: 'true', count: 2 },
        { value: 'false', count: 1 },
      ]);
    });
  });

  describe('applyFacetFilter', () => {
    it('should return all items when filters are empty', () => {
      const items = [
        { propertyType: 'House', city: 'Austin' },
        { propertyType: 'Condo', city: 'Denver' },
      ];

      const result = service.applyFacetFilter(items, {});
      expect(result).toEqual(items);
    });

    it('should filter items matching a single facet', () => {
      const items = [
        { propertyType: 'House', city: 'Austin' },
        { propertyType: 'Condo', city: 'Denver' },
        { propertyType: 'House', city: 'Denver' },
      ];

      const result = service.applyFacetFilter(items, { propertyType: 'House' });
      expect(result).toHaveLength(2);
      expect(result.every((item) => item.propertyType === 'House')).toBe(true);
    });

    it('should filter items matching multiple facets with AND logic', () => {
      const items = [
        { propertyType: 'House', city: 'Austin' },
        { propertyType: 'House', city: 'Denver' },
        { propertyType: 'Condo', city: 'Austin' },
        { propertyType: 'Condo', city: 'Denver' },
      ];

      const result = service.applyFacetFilter(items, { propertyType: 'House', city: 'Austin' });
      expect(result).toEqual([{ propertyType: 'House', city: 'Austin' }]);
    });

    it('should return empty array when no items match', () => {
      const items = [{ propertyType: 'House' }, { propertyType: 'Condo' }];

      const result = service.applyFacetFilter(items, { propertyType: 'Land' });
      expect(result).toEqual([]);
    });
  });
});
