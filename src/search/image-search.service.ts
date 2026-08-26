import { Injectable } from '@nestjs/common';

interface ImageSearchRequest {
  imageUrl: string;
  tags?: string[];
  similarityThreshold?: number;
}

interface ImageSearchResult {
  imageUrl: string;
  tags: string[];
  score: number;
}

@Injectable()
export class ImageSearchService {
  private readonly index: ImageSearchResult[] = [];

  index_image(entry: ImageSearchResult): void {
    this.index.push(entry);
  }

  search(request: ImageSearchRequest): ImageSearchResult[] {
    const threshold = request.similarityThreshold ?? 0.5;
    const queryTags = request.tags ?? [];

    if (queryTags.length === 0) return [...this.index];

    return this.index
      .map((item) => {
        const matched = item.tags.filter((t) => queryTags.includes(t)).length;
        const score = matched / queryTags.length;
        return { ...item, score };
      })
      .filter((item) => item.score >= threshold)
      .sort((a, b) => b.score - a.score);
  }

  clear(): void {
    this.index.length = 0;
  }
}
