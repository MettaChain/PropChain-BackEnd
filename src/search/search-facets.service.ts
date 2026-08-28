import { Injectable } from '@nestjs/common';

interface SearchableItem {
  [key: string]: string | number | boolean | null | undefined;
}

interface FacetValue {
  value: string;
  count: number;
}

interface Facet {
  field: string;
  values: FacetValue[];
}

@Injectable()
export class SearchFacetsService {
  buildFacets(items: SearchableItem[], fields: string[]): Facet[] {
    return fields.map((field) => {
      const counts = new Map<string, number>();

      for (const item of items) {
        const raw = item[field];
        if (raw === null || raw === undefined) continue;
        const val = String(raw);
        counts.set(val, (counts.get(val) ?? 0) + 1);
      }

      const values = [...counts.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count);

      return { field, values };
    });
  }

  applyFacetFilter(items: SearchableItem[], filters: Record<string, string>): SearchableItem[] {
    return items.filter((item) =>
      Object.entries(filters).every(([field, value]) => String(item[field] ?? '') === value),
    );
  }
}
