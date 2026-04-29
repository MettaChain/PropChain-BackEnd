import { Injectable } from '@nestjs/common';

interface SearchEntry {
  query: string;
  timestamp: Date;
}

@Injectable()
export class SearchHistoryService {
  private readonly history = new Map<string, SearchEntry[]>();
  private readonly MAX_PER_USER = 50;

  record(userId: string, query: string): void {
    const entries = this.history.get(userId) ?? [];
    entries.unshift({ query, timestamp: new Date() });
    if (entries.length > this.MAX_PER_USER) entries.pop();
    this.history.set(userId, entries);
  }

  getHistory(userId: string): SearchEntry[] {
    return this.history.get(userId) ?? [];
  }

  clearHistory(userId: string): void {
    this.history.delete(userId);
  }
}
