import { Injectable } from '@nestjs/common';

interface VoiceSearchResult {
  query: string;
  normalised: string;
  tokens: string[];
}

@Injectable()
export class VoiceSearchService {
  private readonly FILLER_WORDS = new Set(['the', 'a', 'an', 'in', 'on', 'at', 'for', 'with']);

  process(rawTranscript: string): VoiceSearchResult {
    const normalised = rawTranscript
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .trim();
    const tokens = normalised
      .split(/\s+/)
      .filter((word) => word.length > 0 && !this.FILLER_WORDS.has(word));

    return { query: rawTranscript, normalised, tokens };
  }

  buildSearchQuery(transcript: string): string {
    const { tokens } = this.process(transcript);
    return tokens.join(' ');
  }
}
