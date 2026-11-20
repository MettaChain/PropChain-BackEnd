import { NotFoundException } from '@nestjs/common';
import { ComparableInput, PropertyValuationService } from '../services/property-valuation.service';

describe('PropertyValuationService', () => {
  let service: PropertyValuationService;

  beforeEach(() => {
    service = new PropertyValuationService();
  });

  const buildComparable = (overrides: Partial<ComparableInput> = {}): ComparableInput => ({
    address: '1 Main Street',
    salePrice: 100000,
    saleDate: new Date('2026-01-01'),
    distance: 1,
    similarityScore: 90,
    ...overrides,
  });

  describe('valuation computation with multiple comparables', () => {
    it('computes a weighted estimate using similarity and distance', () => {
      const result = service.estimate({
        propertyId: 'property-1',
        comparables: [
          buildComparable({ address: 'A', salePrice: 100000, distance: 1, similarityScore: 90 }),
          buildComparable({ address: 'B', salePrice: 120000, distance: 2, similarityScore: 80 }),
          buildComparable({ address: 'C', salePrice: 90000, distance: 5, similarityScore: 60 }),
        ],
      });

      expect(result.comparableCount).toBe(3);
      expect(result.estimatedValue).toBeGreaterThan(0);
      expect(result.metadata.method).toBe('weighted-comparable-analysis');
      expect(result.metadata.radiusKm).toBe(5);
    });

    it('weights higher-similarity, closer comparables more heavily', () => {
      const closeSimilar = service.estimate({
        propertyId: 'property-weighting',
        comparables: [
          buildComparable({ address: 'Close', salePrice: 200000, distance: 0.5, similarityScore: 95 }),
          buildComparable({ address: 'Far', salePrice: 50000, distance: 20, similarityScore: 30 }),
        ],
      });

      expect(closeSimilar.estimatedValue).toBeGreaterThan(125000);
    });

    it('applies adjustments for property differences when characteristics are provided', () => {
      const base = service.estimate({
        propertyId: 'property-adjust-base',
        comparables: [
          buildComparable({ address: 'A', salePrice: 100000, similarityScore: 90 }),
          buildComparable({ address: 'B', salePrice: 100000, similarityScore: 90 }),
        ],
      });

      const adjusted = service.estimate({
        propertyId: 'property-adjust-larger',
        subjectCharacteristics: { sizeSqm: 200, age: 5, amenityScore: 8 },
        comparables: [
          buildComparable({
            address: 'A',
            salePrice: 100000,
            similarityScore: 90,
            characteristics: { sizeSqm: 150, age: 5, amenityScore: 8 },
          }),
          buildComparable({
            address: 'B',
            salePrice: 100000,
            similarityScore: 90,
            characteristics: { sizeSqm: 150, age: 5, amenityScore: 8 },
          }),
        ],
      });

      expect(adjusted.estimatedValue).toBeGreaterThan(base.estimatedValue);
    });

    it('adjusts downward for an older subject property compared to comparables', () => {
      const result = service.estimate({
        propertyId: 'property-age-adjust',
        subjectCharacteristics: { sizeSqm: 150, age: 20, amenityScore: 5 },
        comparables: [
          buildComparable({
            address: 'A',
            salePrice: 100000,
            similarityScore: 90,
            characteristics: { sizeSqm: 150, age: 5, amenityScore: 5 },
          }),
          buildComparable({
            address: 'B',
            salePrice: 100000,
            similarityScore: 90,
            characteristics: { sizeSqm: 150, age: 5, amenityScore: 5 },
          }),
        ],
      });

      expect(result.estimatedValue).toBeLessThan(100000);
    });
  });

  describe('confidence score calculation', () => {
    it('increases confidence with higher similarity scores', () => {
      const highSimilarity = service.estimate({
        propertyId: 'property-conf-high',
        comparables: [
          buildComparable({ address: 'A', similarityScore: 95 }),
          buildComparable({ address: 'B', similarityScore: 95 }),
        ],
      });

      const lowSimilarity = service.estimate({
        propertyId: 'property-conf-low',
        comparables: [
          buildComparable({ address: 'A', similarityScore: 40 }),
          buildComparable({ address: 'B', similarityScore: 40 }),
        ],
      });

      expect(highSimilarity.confidence).toBeGreaterThan(lowSimilarity.confidence);
    });

    it('increases confidence with a larger sample size, up to the cap', () => {
      const comparables = Array.from({ length: 6 }, (_, index) =>
        buildComparable({ address: `Comparable ${index}`, similarityScore: 80 }),
      );

      const result = service.estimate({ propertyId: 'property-conf-sample', comparables });
      expect(result.confidence).toBeLessThanOrEqual(100);
      expect(result.confidence).toBeGreaterThan(48);
    });

    it('caps single-comparable confidence at 40', () => {
      const result = service.estimate({
        propertyId: 'property-conf-single',
        comparables: [buildComparable({ similarityScore: 100 })],
      });

      expect(result.confidence).toBeLessThanOrEqual(40);
    });
  });

  describe('caching behavior', () => {
    it('returns a cache miss on first call', () => {
      const result = service.estimate({
        propertyId: 'property-cache',
        comparables: [buildComparable()],
      });
      expect(result.fromCache).toBe(false);
    });

    it('returns a cache hit for an identical request', () => {
      const request = { propertyId: 'property-cache-hit', comparables: [buildComparable()] };
      service.estimate(request);
      const second = service.estimate(request);
      expect(second.fromCache).toBe(true);
    });

    it('expires cached entries after the TTL elapses', () => {
      jest.useFakeTimers({ doNotFake: ['nextTick'] });
      try {
        (service as unknown as { cacheTtlMs: number }).cacheTtlMs = 1000;
        const request = { propertyId: 'property-cache-ttl', comparables: [buildComparable()] };

        service.estimate(request);
        jest.advanceTimersByTime(2000);
        const result = service.estimate(request);

        expect(result.fromCache).toBe(false);
      } finally {
        jest.useRealTimers();
      }
    });

    it('invalidates the cache for a specific property', () => {
      const request = { propertyId: 'property-cache-invalidate', comparables: [buildComparable()] };
      service.estimate(request);

      service.invalidateCache('property-cache-invalidate');
      const result = service.estimate(request);

      expect(result.fromCache).toBe(false);
    });

    it('invalidates the entire cache when no property is given', () => {
      const requestA = { propertyId: 'property-cache-a', comparables: [buildComparable()] };
      const requestB = { propertyId: 'property-cache-b', comparables: [buildComparable()] };
      service.estimate(requestA);
      service.estimate(requestB);

      service.invalidateCache();

      expect(service.estimate(requestA).fromCache).toBe(false);
      expect(service.estimate(requestB).fromCache).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('returns a zero-value, zero-confidence result when there are no comparable sales', () => {
      const result = service.estimate({ propertyId: 'property-no-comparables', comparables: [] });

      expect(result.estimatedValue).toBe(0);
      expect(result.confidence).toBe(0);
      expect(result.comparableCount).toBe(0);
      expect(result.metadata.method).toBe('none');
    });

    it('returns a zero-value result when comparables are omitted entirely', () => {
      const result = service.estimate({ propertyId: 'property-undefined-comparables' });
      expect(result.comparableCount).toBe(0);
    });

    it('handles a single comparable sale', () => {
      const result = service.estimate({
        propertyId: 'property-single',
        comparables: [buildComparable({ salePrice: 150000, similarityScore: 80 })],
      });

      expect(result.comparableCount).toBe(1);
      expect(result.estimatedValue).toBe(150000);
      expect(result.metadata.method).toBe('single-comparable');
    });

    it('throws a BadRequestException when propertyId is missing', () => {
      expect(() => service.estimate({ propertyId: '' })).toThrow();
    });
  });

  describe('distance calculation for location adjustment', () => {
    it('reduces the weight of comparables that are further away', () => {
      const near = service.estimate({
        propertyId: 'property-distance-near',
        comparables: [
          buildComparable({ address: 'Near', salePrice: 100000, distance: 0, similarityScore: 80 }),
          buildComparable({ address: 'Also near', salePrice: 100000, distance: 0, similarityScore: 80 }),
        ],
      });

      const far = service.estimate({
        propertyId: 'property-distance-far',
        comparables: [
          buildComparable({ address: 'Far', salePrice: 100000, distance: 40, similarityScore: 80 }),
          buildComparable({ address: 'Also far', salePrice: 200000, distance: 0, similarityScore: 80 }),
        ],
      });

      expect(far.estimatedValue).toBeGreaterThan(100000);
      expect(near.estimatedValue).toBeCloseTo(100000, 0);
    });
  });

  describe('adjustment for property differences', () => {
    it('adjusts for size, age, and amenities together', () => {
      const result = service.estimate({
        propertyId: 'property-full-adjustment',
        subjectCharacteristics: { sizeSqm: 180, age: 2, amenityScore: 9 },
        comparables: [
          buildComparable({
            address: 'A',
            salePrice: 150000,
            similarityScore: 85,
            characteristics: { sizeSqm: 150, age: 10, amenityScore: 6 },
          }),
          buildComparable({
            address: 'B',
            salePrice: 150000,
            similarityScore: 85,
            characteristics: { sizeSqm: 150, age: 10, amenityScore: 6 },
          }),
        ],
      });

      // size (+30 * 150), age (-8 * -500 => +4000), amenity (+3 * 1000) all push the value up.
      expect(result.estimatedValue).toBeGreaterThan(150000);
    });

    it('never adjusts a comparable price below zero', () => {
      const result = service.estimate({
        propertyId: 'property-floor',
        subjectCharacteristics: { sizeSqm: 10, age: 100, amenityScore: 0 },
        comparables: [
          buildComparable({
            salePrice: 1000,
            similarityScore: 50,
            characteristics: { sizeSqm: 500, age: 0, amenityScore: 10 },
          }),
        ],
      });

      expect(result.estimatedValue).toBeGreaterThanOrEqual(0);
    });
  });

  describe('get', () => {
    it('retrieves a previously computed valuation by id', () => {
      const created = service.estimate({
        propertyId: 'property-get',
        comparables: [buildComparable()],
      });

      const retrieved = service.get(created.id);
      expect(retrieved.propertyId).toBe('property-get');
    });

    it('throws NotFoundException for an unknown valuation id', () => {
      expect(() => service.get('unknown-id')).toThrow(NotFoundException);
    });
  });
});
