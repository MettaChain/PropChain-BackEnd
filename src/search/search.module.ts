import { Module } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';
import { SearchAnalyticsService } from './search-analytics.service';
import { SearchAutocompleteService } from './search-autocomplete.service';
import { SearchFiltersService } from './search-filters.service';
import { SearchGeographicService } from './search-geographic.service';
import { SearchHistoryService } from './search-history.service';
import { SearchFacetsService } from './search-facets.service';
import { PrismaModule } from '../database/prisma.module';
import { CacheModuleConfig } from '../cache/cache.module';

@Module({
  imports: [PrismaModule, CacheModuleConfig],
  controllers: [SearchController],
  providers: [
    SearchService,
    SearchAnalyticsService,
    SearchAutocompleteService,
    SearchFiltersService,
    SearchGeographicService,
    SearchHistoryService,
    SearchFacetsService,
  ],
  exports: [
    SearchService,
    SearchAnalyticsService,
    SearchAutocompleteService,
    SearchFiltersService,
    SearchGeographicService,
    SearchHistoryService,
    SearchFacetsService,
  ],
})
export class SearchModule {}
