import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Patch,
  Query,
  UseGuards,
  UseInterceptors,
  Res,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  HttpStatus,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PropertiesService } from './properties.service';
import { CreatePropertyDto, UpdatePropertyDto } from './dto/property.dto';
import { AssignAgentDto, UpdateAgentAssignmentDto } from './dto/agent-assignment.dto';
import { SearchPropertiesDto } from './dto/search-properties.dto';
import { TransitionPropertyStatusDto } from './dto/transition-status.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUserPayload } from '../auth/types/auth-user.type';
import { PropertyStatus, UserRole } from '../types/prisma.types';
import {
  BulkPropertyStatusUpdateDto,
  BulkPropertyDeleteDto,
  BulkPropertyExportDto,
} from './dto/bulk-operations.dto';
import { CreateAmenityDto, UpdateAmenityDto } from './dto/amenity.dto';
import { PropertyReportService } from './report/property-report.service';
import { Response } from 'express';

import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PropertiesMetricsInterceptor } from './interceptors/properties-metrics.interceptor';
import {
  PropertiesRouteLimit,
  PropertiesRouteRateLimitGuard,
} from './guards/properties-route-rate-limit.guard';

import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';


@ApiTags('Properties')
@UseInterceptors(PropertiesMetricsInterceptor)
@Controller('properties')
export class PropertiesController {
  constructor(
    private readonly propertiesService: PropertiesService,
    private readonly propertyReportService: PropertyReportService,
  ) {}

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, PropertiesRouteRateLimitGuard)
  @PropertiesRouteLimit({ max: 30, windowMs: 60 * 60 * 1000 })
  @Post()
  create(@Body() createPropertyDto: CreatePropertyDto, @CurrentUser() user: AuthUserPayload) {
    return this.propertiesService.create(createPropertyDto, user.sub);
  }

  @Get()
  @ApiOperation({
    summary: 'List published property listings',
    description:
      'Unauthenticated. Returns only ACTIVE, non-deleted listings, newest first by default.

Rate limited to 100 requests per minute per client; see `X-RateLimit-*` response headers.',
    operationId: 'listProperties',
  })
  @ApiResponse({ status: 200, description: 'The published listings' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  findAll() {
    return this.propertiesService.findAll();
  }

  /**
   * Advanced property search.
   * Supports filters: price range (minPrice/maxPrice), location
   * (city/state/zipCode/country or free-text `location`), propertyType,
   * bedrooms (exact or min/max), bathrooms (exact or min/max), plus status,
   * pagination (page, limit) and sorting (sortBy, sortOrder).
   *
   * Defined before `:id` so the static path is matched first.
   */
  @Get('search')
  @ApiOperation({
    summary: 'Search property listings',
    description:
      'Unauthenticated. Every filter is optional and they combine with AND.

'
      + 'The response is `{ items, total, page, limit, totalPages }`. Results are always '
      + 'ACTIVE, non-deleted listings regardless of the `status` filter.

'
      + '`minNeighborhoodTrustScore` / `maxNeighborhoodTrustScore` filter on a score computed '
      + 'from the neighborhood row, so it is applied in memory after fetching; a listing with '
      + 'no neighborhood scores `null` and is excluded whenever either bound is set.

'
      + 'Rate limited to 60 searches per minute per client.',
    operationId: 'searchProperties',
  })
  @ApiQuery({ name: 'minPrice', required: false, type: Number, description: 'Lowest asking price.' })
  @ApiQuery({ name: 'maxPrice', required: false, type: Number, description: 'Highest asking price.' })
  @ApiQuery({ name: 'city', required: false, description: 'City, case-insensitive.' })
  @ApiQuery({ name: 'state', required: false, description: 'State/province/region, case-insensitive.' })
  @ApiQuery({ name: 'zipCode', required: false, description: 'Postal code.' })
  @ApiQuery({ name: 'country', required: false, description: 'Country, case-insensitive.' })
  @ApiQuery({
    name: 'location',
    required: false,
    description: 'Free text matched against address, city, state and zipCode (OR).',
  })
  @ApiQuery({ name: 'propertyType', required: false, description: 'HOUSE, APARTMENT, CONDO, LAND, ...' })
  @ApiQuery({ name: 'bedrooms', required: false, type: Number, description: 'Exact bedroom count.' })
  @ApiQuery({ name: 'minBedrooms', required: false, type: Number, description: 'Overrides `bedrooms` when both are given.' })
  @ApiQuery({ name: 'maxBedrooms', required: false, type: Number })
  @ApiQuery({ name: 'bathrooms', required: false, type: Number, description: 'Exact count; half-baths allowed.' })
  @ApiQuery({ name: 'minBathrooms', required: false, type: Number })
  @ApiQuery({ name: 'maxBathrooms', required: false, type: Number })
  @ApiQuery({ name: 'category', required: false, description: 'Listing category, case-insensitive.' })
  @ApiQuery({ name: 'tag', required: false, description: 'Exact tag match (array containment).' })
  @ApiQuery({ name: 'amenityType', required: false, description: 'Requires at least one amenity of this type.' })
  @ApiQuery({ name: 'minYearBuilt', required: false, type: Number })
  @ApiQuery({ name: 'maxYearBuilt', required: false, type: Number })
  @ApiQuery({ name: 'minNeighborhoodTrustScore', required: false, type: Number, minimum: 0, maximum: 100 })
  @ApiQuery({ name: 'maxNeighborhoodTrustScore', required: false, type: Number, minimum: 0, maximum: 100 })
  @ApiQuery({
    name: 'lat',
    required: false,
    type: Number,
    description: 'Latitude. Must be supplied together with `lng`.',
  })
  @ApiQuery({
    name: 'lng',
    required: false,
    type: Number,
    description: 'Longitude. Must be supplied together with `lat`.',
  })
  @ApiQuery({
    name: 'radiusKm',
    required: false,
    type: Number,
    description: 'Approximated as a bounding box (1 degree of latitude is about 111 km).',
  })
  @ApiQuery({ name: 'minLat', required: false, type: Number, description: 'Bounding box south edge.' })
  @ApiQuery({ name: 'maxLat', required: false, type: Number, description: 'Bounding box north edge.' })
  @ApiQuery({ name: 'minLng', required: false, type: Number, description: 'Bounding box west edge.' })
  @ApiQuery({ name: 'maxLng', required: false, type: Number, description: 'Bounding box east edge.' })
  @ApiQuery({ name: 'minExpiryDate', required: false, type: String, format: 'date-time' })
  @ApiQuery({ name: 'maxExpiryDate', required: false, type: String, format: 'date-time' })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    minimum: 1,
    description: '1-based page number. Default 1.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    minimum: 1,
    maximum: 100,
    description: 'Listings per page. Default 20.',
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    description: 'price, createdAt, updatedAt, bedrooms, bathrooms, squareFeet, yearBuilt.',
  })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  @ApiResponse({ status: 200, description: 'A page of matching listings' })
  @ApiResponse({ status: 400, description: 'A filter is out of range, or the geo parameters contradict' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  search(@Query() searchDto: SearchPropertiesDto) {
    return this.propertiesService.searchProperties(searchDto);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const property = await this.propertiesService.findOne(id);
    // Previously an unknown id produced 200 with an empty body.
    if (!property) throw new NotFoundException(`Property with ID ${id} not found`);
    return property;
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.AGENT, UserRole.ADMIN)
  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() updatePropertyDto: UpdatePropertyDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.propertiesService.update(id, updatePropertyDto, user.sub);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUserPayload) {
    return this.propertiesService.remove(id, user);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id/restore')
  restore(@Param('id') id: string, @CurrentUser() user: AuthUserPayload) {
    return this.propertiesService.restore(id, user);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, PropertiesRouteRateLimitGuard)
  @PropertiesRouteLimit({ max: 15, windowMs: 60 * 60 * 1000 })
  @Get(':id/report')
  async generateReport(@Param('id') id: string, @Res() res: Response): Promise<void> {
    try {
      const pdfBuffer = await this.propertyReportService.generatePropertyReport(id);

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="property-report-${id}.pdf"`,
        'Content-Length': pdfBuffer.length,
      });

      res.send(pdfBuffer);
    } catch (error) {
      // Re-throw known NestJS HTTP exceptions so the global exception filter
      // handles them correctly without leaking internal details.
      if (error instanceof NotFoundException || error instanceof InternalServerErrorException) {
        throw error;
      }

      // Remap Prisma "not found" errors to a safe NotFoundException.
      const err = error as { code?: string; name?: string };
      if (err?.code === 'P2025' || err?.name === 'NotFoundError') {
        throw new NotFoundException(`Property with id "${id}" was not found`);
      }

      // All other unexpected errors become a generic 500 with no internal detail.
      throw new InternalServerErrorException('Failed to generate property report');
    }
  }

  /**
   * Transition a property's lifecycle status.
   * Workflow: DRAFT → PENDING → ACTIVE → UNDER_CONTRACT → SOLD
   * (plus a few additional reasonable transitions — see
   * `property-status.constants.ts`).
   *
   * Allowed for the property's owner, AGENT, or ADMIN.
   */
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @Patch(':id/status')
  transitionStatus(
    @Param('id') id: string,
    @Body() dto: TransitionPropertyStatusDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.propertiesService.transitionStatus(
      id,
      dto.status as PropertyStatus,
      user.sub,
      user.role,
    );
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id/approve')
  approve(@Param('id') id: string, @CurrentUser() user: AuthUserPayload) {
    return this.propertiesService.approveProperty(id, user.sub);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id/reject')
  reject(@Param('id') id: string, @CurrentUser() user: AuthUserPayload) {
    return this.propertiesService.rejectProperty(id, user.sub);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('bulk/status')
  @UseGuards(PropertiesRouteRateLimitGuard)
  @PropertiesRouteLimit({ max: 20, windowMs: 60 * 60 * 1000 })
  async bulkUpdatePropertyStatus(
    @Body() body: BulkPropertyStatusUpdateDto,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.propertiesService.bulkUpdatePropertyStatus(body.propertyIds, body.status);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('bulk/delete')
  @UseGuards(PropertiesRouteRateLimitGuard)
  @PropertiesRouteLimit({ max: 20, windowMs: 60 * 60 * 1000 })
  async bulkDeleteProperties(
    @Body() body: BulkPropertyDeleteDto,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.propertiesService.bulkDeleteProperties(body.propertyIds);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('bulk/export')
  @UseGuards(PropertiesRouteRateLimitGuard)
  @PropertiesRouteLimit({ max: 10, windowMs: 60 * 60 * 1000 })
  async bulkExportProperties(
    @Body() body: BulkPropertyExportDto,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.propertiesService.bulkExportProperties(body.propertyIds, body.filter);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @Post(':id/agents')
  async assignAgent(
    @Param('id') propertyId: string,
    @Body() dto: AssignAgentDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.propertiesService.assignAgent(propertyId, dto, user);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @Put(':id/agents/:agentId')
  async updateAgentAssignment(
    @Param('id') propertyId: string,
    @Param('agentId') agentId: string,
    @Body() dto: UpdateAgentAssignmentDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.propertiesService.updateAgentAssignment(propertyId, agentId, dto, user);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @Delete(':id/agents/:agentId')
  async removeAgentAssignment(
    @Param('id') propertyId: string,
    @Param('agentId') agentId: string,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.propertiesService.removeAgentAssignment(propertyId, agentId, user);
  }

  @Get(':id/agents')
  async getAgents(@Param('id') propertyId: string) {
    return this.propertiesService.getAgents(propertyId);
  }

  // ---- Amenity endpoints (#551) ----

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @Post(':id/amenities')
  async addAmenity(@Param('id') propertyId: string, @Body() dto: CreateAmenityDto) {
    return this.propertiesService.addAmenity(propertyId, dto);
  }

  @Get(':id/amenities')
  async getAmenities(@Param('id') propertyId: string) {
    return this.propertiesService.getAmenities(propertyId);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @Patch(':id/amenities/:amenityId')
  async updateAmenity(
    @Param('id') propertyId: string,
    @Param('amenityId') amenityId: string,
    @Body() dto: UpdateAmenityDto,
  ) {
    return this.propertiesService.updateAmenity(propertyId, amenityId, dto);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @Delete(':id/amenities/:amenityId')
  async removeAmenity(@Param('id') propertyId: string, @Param('amenityId') amenityId: string) {
    return this.propertiesService.removeAmenity(propertyId, amenityId);
  }
}
