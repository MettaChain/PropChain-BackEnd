// @ts-nocheck

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
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';

@ApiTags('Properties')
@Controller('properties')
export class PropertiesController {
  constructor(
    private readonly propertiesService: PropertiesService,
    private readonly propertyReportService: PropertyReportService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Body() createPropertyDto: CreatePropertyDto, @CurrentUser() user: AuthUserPayload) {
    return this.propertiesService.create(createPropertyDto, user.sub);
  }

  @Get()
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
  search(@Query() searchDto: SearchPropertiesDto) {
    return this.propertiesService.searchProperties(searchDto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.propertiesService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.AGENT, UserRole.ADMIN)
  @Put(':id')
  update(@Param('id') id: string, @Body() updatePropertyDto: UpdatePropertyDto) {
    return this.propertiesService.update(id, updatePropertyDto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUserPayload) {
    return this.propertiesService.remove(id, user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id/restore')
  restore(@Param('id') id: string, @CurrentUser() user: AuthUserPayload) {
    return this.propertiesService.restore(id, user);
  }

  @UseGuards(JwtAuthGuard)
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
      if (error?.code === 'P2025' || error?.name === 'NotFoundError') {
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

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id/approve')
  approve(@Param('id') id: string, @CurrentUser() user: AuthUserPayload) {
    return this.propertiesService.approveProperty(id, user.sub);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id/reject')
  reject(@Param('id') id: string, @CurrentUser() user: AuthUserPayload) {
    return this.propertiesService.rejectProperty(id, user.sub);
  }

  @Post('bulk/status')
  async bulkUpdatePropertyStatus(
    @Body() body: BulkPropertyStatusUpdateDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.propertiesService.bulkUpdatePropertyStatus(body.propertyIds, body.status);
  }

  @Post('bulk/delete')
  async bulkDeleteProperties(
    @Body() body: BulkPropertyDeleteDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.propertiesService.bulkDeleteProperties(body.propertyIds);
  }

  @Post('bulk/export')
  async bulkExportProperties(
    @Body() body: BulkPropertyExportDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.propertiesService.bulkExportProperties(body.propertyIds, body.filter);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/agents')
  async assignAgent(
    @Param('id') propertyId: string,
    @Body() dto: AssignAgentDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.propertiesService.assignAgent(propertyId, dto, user);
  }

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

  @UseGuards(JwtAuthGuard)
  @Post(':id/amenities')
  async addAmenity(@Param('id') propertyId: string, @Body() dto: CreateAmenityDto) {
    return this.propertiesService.addAmenity(propertyId, dto);
  }

  @Get(':id/amenities')
  async getAmenities(@Param('id') propertyId: string) {
    return this.propertiesService.getAmenities(propertyId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/amenities/:amenityId')
  async updateAmenity(
    @Param('id') propertyId: string,
    @Param('amenityId') amenityId: string,
    @Body() dto: UpdateAmenityDto,
  ) {
    return this.propertiesService.updateAmenity(propertyId, amenityId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id/amenities/:amenityId')
  async removeAmenity(@Param('id') propertyId: string, @Param('amenityId') amenityId: string) {
    return this.propertiesService.removeAmenity(propertyId, amenityId);
  }
}
