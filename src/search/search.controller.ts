import { Controller, Get, Post, Query, Body, UseGuards, Request } from '@nestjs/common';
import { SearchService, SearchQuery } from './search.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    role: string;
  };
}

@ApiTags('search')
@Controller('search')
@UseGuards(JwtAuthGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Post('properties')
  @ApiOperation({ summary: 'Search properties with advanced filters' })
  @ApiResponse({ status: 200, description: 'Search results returned successfully' })
  async searchProperties(@Request() req: AuthenticatedRequest, @Body() searchQuery: SearchQuery) {
    return this.searchService.searchProperties(req.user.id, searchQuery);
  }

  @Get('projects')
  @ApiOperation({ summary: 'Full-text search for projects' })
  @ApiQuery({ name: 'q', required: true, description: 'Search query' })
  @ApiResponse({ status: 200, description: 'Project search results returned successfully' })
  async searchProjects(@Query('q') query: string, @Query() filters: any) {
    return this.searchService.searchProjects(query, filters);
  }

  @Get('suggestions')
  @ApiOperation({ summary: 'Get search autocomplete suggestions' })
  @ApiQuery({ name: 'q', required: false, description: 'Search query' })
  @ApiResponse({ status: 200, description: 'Suggestions returned successfully' })
  async getSuggestions(@Query('q') query?: string) {
    return this.searchService.getSuggestions(query || '');
  }

  @Get('terms')
  @ApiOperation({ summary: 'Get full-text search term suggestions' })
  @ApiQuery({ name: 'q', required: true, description: 'Search query prefix' })
  @ApiResponse({ status: 200, description: 'Search term suggestions returned successfully' })
  async suggestTerms(@Query('q') query: string) {
    return this.searchService.suggestTerms(query);
  }

  @Get('filters/saved')
  @ApiOperation({ summary: 'Get user\'s saved filters' })
  @ApiResponse({ status: 200, description: 'Saved filters returned successfully' })
  async getSavedFilters(@Request() req: AuthenticatedRequest) {
    return this.searchService.getSavedFilters(req.user.id);
  }

  @Post('filters/save')
  @ApiOperation({ summary: 'Save a search filter' })
  @ApiResponse({ status: 201, description: 'Filter saved successfully' })
  async saveFilter(@Request() req: AuthenticatedRequest, @Body() filter: any) {
    return this.searchService.saveFilter(req.user.id, filter);
  }

  @Get('analytics')
  @ApiOperation({ summary: 'Get search analytics' })
  @ApiResponse({ status: 200, description: 'Analytics returned successfully' })
  async getSearchAnalytics(@Request() req: AuthenticatedRequest) {
    return this.searchService.getSearchAnalytics(req.user.id);
  }

  @Get('analytics/popular')
  @ApiOperation({ summary: 'Get popular searches' })
  @ApiResponse({ status: 200, description: 'Popular searches returned successfully' })
  async getPopularSearches() {
    return this.searchService.getPopularSearches();
  }
}
