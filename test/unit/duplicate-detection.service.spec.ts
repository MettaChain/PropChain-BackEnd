import { DuplicateDetectionService } from '../../src/duplicate-detection/duplicate-detection.service';
import { PrismaService } from '../../src/database/prisma.service';
import { FraudService } from '../../src/fraud/fraud.service';

// detectTextSimilarity is pure (no DB), so the Prisma/Fraud deps are unused here.
function makeService(): DuplicateDetectionService {
  return new DuplicateDetectionService({} as PrismaService, {} as FraudService);
}

describe('DuplicateDetectionService.detectTextSimilarity', () => {
  let service: DuplicateDetectionService;

  beforeEach(() => {
    service = makeService();
  });

  it('scores identical listings as a 100% (exact) match', async () => {
    const a = { description: 'Spacious modern condo near the park', features: ['pool', 'garage'] };
    const result = await service.detectTextSimilarity(a, { ...a });
    expect(result.score).toBe(100);
    expect(result.matchedTerms.length).toBeGreaterThan(0);
  });

  it('scores near-duplicates in a partial range (not exact, not zero)', async () => {
    const a = { description: 'Spacious modern condo near the park', features: ['pool'] };
    const b = { description: 'Spacious modern condo near downtown', features: ['garage'] };
    const result = await service.detectTextSimilarity(a, b);
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(100);
    expect(result.matchedTerms).toEqual(expect.arrayContaining(['spacious', 'modern', 'condo']));
  });

  it('does NOT flag clearly distinct listings (low/zero overlap)', async () => {
    const a = { description: 'Luxury beachfront villa', features: ['pool'] };
    const b = { description: 'Downtown parking garage unit', features: ['elevator'] };
    const result = await service.detectTextSimilarity(a, b);
    expect(result.score).toBeLessThan(30);
  });

  it('handles empty/missing text safely (score 0)', async () => {
    const result = await service.detectTextSimilarity(
      { description: null, features: null },
      { description: null, features: [] },
    );
    expect(result.score).toBe(0);
    expect(result.matchedTerms).toEqual([]);
  });
});
