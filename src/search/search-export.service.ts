import { Injectable } from '@nestjs/common';

interface ExportableItem {
  [key: string]: string | number | boolean | null | undefined;
}

@Injectable()
export class SearchExportService {
  toCsv(items: ExportableItem[]): string {
    if (items.length === 0) return '';

    const headers = Object.keys(items[0]);

    const escapeField = (val: string | number | boolean | null | undefined): string => {
      const s = String(val ?? '');
      const needsQuoting = s.includes(',') || s.includes('"') || s.includes('\n');
      return needsQuoting ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const rows = items.map((item) => headers.map((h) => escapeField(item[h])).join(','));
    return [headers.join(','), ...rows].join('\n');
  }

  toJson(items: ExportableItem[]): string {
    return JSON.stringify(items, null, 2);
  }
}
