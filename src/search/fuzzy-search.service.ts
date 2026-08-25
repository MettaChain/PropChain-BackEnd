import { Injectable } from '@nestjs/common';

interface FuzzySearchResult {
  item: string;
  score: number;
}

@Injectable()
export class FuzzySearchService {
  search(query: string, items: string[]): FuzzySearchResult[] {
    if (!query || items.length === 0) return [];

    const normalised = query.toLowerCase();

    return items
      .map((item) => ({ item, score: this.score(normalised, item.toLowerCase()) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score);
  }

  private score(query: string, target: string): number {
    if (target.includes(query)) return 1;

    let qi = 0;
    let matches = 0;

    for (let ti = 0; ti < target.length && qi < query.length; ti++) {
      if (target[ti] === query[qi]) {
        matches++;
        qi++;
      }
    }

    if (qi < query.length) return 0;

    return matches / target.length;
  }
}
