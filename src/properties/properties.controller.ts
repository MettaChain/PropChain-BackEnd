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
import {
  ApiBearerAuth,

  ApiBody,
  ApiOperation,
  ApiParam,
  ApiProduces,

  ApiOperation,
  ApiQuery,

  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

@ApiTags('Properties')
@Controller('properties')
export class PropertiesController {
  constructor(
    private readonly propertiesService: PropertiesService,
    private readonly propertyReportService: PropertyReportService,
  ) {}

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @Post()
  @ApiOperation({ summary: 'Create a property listing', operationId: 'createProperty' })
  @ApiBody({ type: CreatePropertyDto })
  @ApiResponse({ status: 201, description: 'Listing created in DRAFT status' })
  @ApiResponse({ status: 400, description: 'Validation failed, or the address already exists' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
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
  @ApiOperation({ summary: 'Get one property listing', operationId: 'getProperty' })
  @ApiParam({ name: 'id', description: 'Property id' })
  @ApiResponse({ status: 200, description: 'The property, with owner, documents and assigned agents' })
  @ApiResponse({ status: 404, description: 'No property with that id' })
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
  @ApiOperation({
    summary: 'Update a property listing',
    description: 'AGENT or ADMIN only. A price change is recorded in the price history.',
    operationId: 'updateProperty',
  })
  @ApiParam({ name: 'id', description: 'Property id' })
  @ApiBody({ type: UpdatePropertyDto })
  @ApiResponse({ status: 200, description: 'The updated property' })
  @ApiResponse({ status: 400, description: 'Validation failed, or the address already exists' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 403, description: 'Caller is not an AGENT or ADMIN' })
  @ApiResponse({ status: 404, description: 'No property with that id' })
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
  @ApiOperation({
    summary: 'Soft-delete a property listing',
    description: 'ADMIN only. The row is kept and archived; see `restore` to undo.',
    operationId: 'deleteProperty',
  })
  @ApiParam({ name: 'id', description: 'Property id' })
  @ApiResponse({ status: 200, description: 'The archived property' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 403, description: 'Caller is not an ADMIN' })
  @ApiResponse({ status: 404, description: 'No property with that id' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthUserPayload) {
    return this.propertiesService.remove(id, user);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id/restore')
  @ApiOperation({
    summary: 'Restore a soft-deleted property listing',
    description: 'ADMIN only. The listing returns to DRAFT.',
    operationId: 'restoreProperty',
  })
  @ApiParam({ name: 'id', description: 'Property id' })
  @ApiResponse({ status: 200, description: 'The restored property' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 403, description: 'Caller is not an ADMIN' })
  @ApiResponse({ status: 404, description: 'No property with that id' })
  restore(@Param('id') id: string, @CurrentUser() user: AuthUserPayload) {
    return this.propertiesService.restore(id, user);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @Get(':id/report')
  @ApiOperation({
    summary: 'Download the PDF report for a listing',
    operationId: 'downloadPropertyReport',
  })
  @ApiParam({ name: 'id', description: 'Property id' })
  @ApiProduces('application/pdf')
  @ApiResponse({ status: 200, description: 'PDF report', schema: { type: 'string', format: 'binary' } })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 404, description: 'No property with that id' })
  @ApiResponse({ status: 500, description: 'The report could not be generated' })
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
  @ApiOperation({
    summary: 'Transition a listing to a new lifecycle status',
    description:
      'DRAFT -> PENDING -> ACTIVE -> UNDER_CONTRACT -> SOLD, plus the other transitions in `property-status.constants.ts`. Allowed for the property owner, AGENT or ADMIN.',
    operationId: 'transitionPropertyStatus',
  })
  @ApiParam({ name: 'id', description: 'Property id' })
  @ApiBody({ type: TransitionPropertyStatusDto })
  @ApiResponse({ status: 200, description: 'The property with its new status' })
  @ApiResponse({ status: 400, description: 'Validation failed, or the transition is not allowed' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 403, description: 'Caller is not the owner, an AGENT or an ADMIN' })
  @ApiResponse({ status: 404, description: 'No property with that id' })
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
  @ApiOperation({
    summary: 'Approve a pending listing',
    description: 'ADMIN only. Transitions the listing to ACTIVE.',
    operationId: 'approveProperty',
  })
  @ApiParam({ name: 'id', description: 'Property id' })
  @ApiResponse({ status: 200, description: 'The approved property' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 403, description: 'Caller is not an ADMIN' })
  @ApiResponse({ status: 404, description: 'No property with that id' })
  approve(@Param('id') id: string, @CurrentUser() user: AuthUserPayload) {
    return this.propertiesService.approveProperty(id, user.sub);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id/reject')
  @ApiOperation({
    summary: 'Reject a pending listing',
    description: 'ADMIN only. Transitions the listing to REJECTED.',
    operationId: 'rejectProperty',
  })
  @ApiParam({ name: 'id', description: 'Property id' })
  @ApiResponse({ status: 200, description: 'The rejected property' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 403, description: 'Caller is not an ADMIN' })
  @ApiResponse({ status: 404, description: 'No property with that id' })
  reject(@Param('id') id: string, @CurrentUser() user: AuthUserPayload) {
    return this.propertiesService.rejectProperty(id, user.sub);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('bulk/status')
  @ApiOperation({
    summary: 'Change the status of several listings at once',
    operationId: 'bulkUpdatePropertyStatus',
  })
  @ApiBody({ type: BulkPropertyStatusUpdateDto })
  @ApiResponse({ status: 201, description: 'Number of listings updated' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 403, description: 'Caller is not an ADMIN' })
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
  @ApiOperation({
    summary: 'Soft-delete several listings at once',
    operationId: 'bulkDeleteProperties',
  })
  @ApiBody({ type: BulkPropertyDeleteDto })
  @ApiResponse({ status: 201, description: 'Number of listings deleted' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 403, description: 'Caller is not an ADMIN' })
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
  @ApiOperation({
    summary: 'Export several listings as JSON',
    operationId: 'bulkExportProperties',
  })
  @ApiBody({ type: BulkPropertyExportDto })
  @ApiResponse({ status: 201, description: 'The matching listings' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 403, description: 'Caller is not an ADMIN' })
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
  @ApiOperation({ summary: 'Assign an agent to a listing', operationId: 'assignPropertyAgent' })
  @ApiParam({ name: 'id', description: 'Property id' })
  @ApiBody({ type: AssignAgentDto })
  @ApiResponse({ status: 201, description: 'The new assignment' })
  @ApiResponse({ status: 400, description: 'Validation failed, or the agent is already assigned' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 403, description: 'Caller is not the owner or an ADMIN' })
  @ApiResponse({ status: 404, description: 'No property with that id, or no such agent' })
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
  @ApiOperation({
    summary: 'Change an agent assignment (commission, contact details)',
    operationId: 'updatePropertyAgentAssignment',
  })
  @ApiParam({ name: 'id', description: 'Property id' })
  @ApiParam({ name: 'agentId', description: 'Assigned agent id' })
  @ApiBody({ type: UpdateAgentAssignmentDto })
  @ApiResponse({ status: 200, description: 'The updated assignment' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 403, description: 'Caller is not the owner or an ADMIN' })
  @ApiResponse({ status: 404, description: 'No property with that id, or the agent is not assigned' })
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
  @ApiOperation({
    summary: 'Remove an agent from a listing',
    operationId: 'removePropertyAgentAssignment',
  })
  @ApiParam({ name: 'id', description: 'Property id' })
  @ApiParam({ name: 'agentId', description: 'Assigned agent id' })
  @ApiResponse({ status: 200, description: 'The removed assignment' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 403, description: 'Caller is not the owner or an ADMIN' })
  @ApiResponse({ status: 404, description: 'No property with that id, or the agent is not assigned' })
  async removeAgentAssignment(
    @Param('id') propertyId: string,
    @Param('agentId') agentId: string,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.propertiesService.removeAgentAssignment(propertyId, agentId, user);
  }

  @Get(':id/agents')
  @ApiOperation({ summary: 'List the agents assigned to a listing', operationId: 'getPropertyAgents' })
  @ApiParam({ name: 'id', description: 'Property id' })
  @ApiResponse({ status: 200, description: 'Assignments, each with its agent' })
  @ApiResponse({ status: 404, description: 'No property with that id' })
  async getAgents(@Param('id') propertyId: string) {
    return this.propertiesService.getAgents(propertyId);
  }

  // ---- Amenity endpoints (#551) ----

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @Post(':id/amenities')
  @ApiOperation({ summary: 'Add an amenity to a listing', operationId: 'addPropertyAmenity' })
  @ApiParam({ name: 'id', description: 'Property id' })
  @ApiBody({ type: CreateAmenityDto })
  @ApiResponse({ status: 201, description: 'The new amenity' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 404, description: 'No property with that id' })
  async addAmenity(@Param('id') propertyId: string, @Body() dto: CreateAmenityDto) {
    return this.propertiesService.addAmenity(propertyId, dto);
  }

  @Get(':id/amenities')
  @ApiOperation({ summary: 'List the amenities of a listing', operationId: 'getPropertyAmenities' })
  @ApiParam({ name: 'id', description: 'Property id' })
  @ApiResponse({ status: 200, description: 'The amenities, oldest first' })
  @ApiResponse({ status: 404, description: 'No property with that id' })
  async getAmenities(@Param('id') propertyId: string) {
    return this.propertiesService.getAmenities(propertyId);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @Patch(':id/amenities/:amenityId')
  @ApiOperation({
    summary: 'Update an amenity on a listing',
    operationId: 'updatePropertyAmenity',
  })
  @ApiParam({ name: 'id', description: 'Property id' })
  @ApiParam({ name: 'amenityId', description: 'Amenity id' })
  @ApiBody({ type: UpdateAmenityDto })
  @ApiResponse({ status: 200, description: 'The updated amenity' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 404, description: 'No property with that id, or no such amenity on it' })
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
  @ApiOperation({
    summary: 'Remove an amenity from a listing',
    operationId: 'removePropertyAmenity',
  })
  @ApiParam({ name: 'id', description: 'Property id' })
  @ApiParam({ name: 'amenityId', description: 'Amenity id' })
  @ApiResponse({ status: 200, description: 'The removed amenity' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 404, description: 'No property with that id, or no such amenity on it' })
  async removeAmenity(@Param('id') propertyId: string, @Param('amenityId') amenityId: string) {
    return this.propertiesService.removeAmenity(propertyId, amenityId);
  }
}
