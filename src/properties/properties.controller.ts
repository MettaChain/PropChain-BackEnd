import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { PropertiesService } from './properties.service';
import { CreatePropertyDto, UpdatePropertyDto, PropertyQueryDto, PropertyResponseDto, PropertyStatus } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PropertySearchService } from './search/property-search.service';
import { PropertySearchDto } from './dto/property-search.dto';

@ApiTags('properties')
@Controller('properties')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class PropertiesController {
  constructor(
    private readonly propertiesService: PropertiesService,
    private readonly propertySearchService: PropertySearchService,
  ) {}
  @Post()
  @ApiOperation({ summary: 'Create a new property' })
  @ApiResponse({ status: 201, description: 'Property created successfully.', type: PropertyResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid input data.' })
  create(@Body() createPropertyDto: CreatePropertyDto, @Request() req) {
    return this.propertiesService.create(createPropertyDto, req.user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Get all properties with optional filters' })
  @ApiResponse({ status: 200, description: 'List of properties.' })
  findAll(@Query() query: PropertyQueryDto) {
    return this.propertiesService.findAll(query);
  }

  @Get('search')
  @ApiOperation({ summary: 'Advanced property search (geospatial + filters)' })
  @ApiResponse({ status: 200, description: 'Search results.' })
  search(@Query() dto: PropertySearchDto, @Request() req) {
    return this.propertySearchService.search(dto, req.user.id);
  }

  @Get('statistics')
  @ApiOperation({ summary: 'Get property statistics' })
  @ApiResponse({ status: 200, description: 'Property statistics.' })
  getStatistics() {
    return this.propertiesService.getStatistics();
  }

  @Get('owner/:ownerId')
  @ApiOperation({ summary: 'Get properties by owner' })
  @ApiParam({ name: 'ownerId', description: 'Owner ID' })
  @ApiResponse({ status: 200, description: 'Properties by owner.' })
  findByOwner(@Param('ownerId') ownerId: string, @Query() query: PropertyQueryDto) {
    return this.propertiesService.findByOwner(ownerId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a property by ID' })
  @ApiParam({ name: 'id', description: 'Property ID' })
  @ApiResponse({ status: 200, description: 'Property found.', type: PropertyResponseDto })
  @ApiResponse({ status: 404, description: 'Property not found.' })
  findOne(@Param('id') id: string) {
    return this.propertiesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a property' })
  @ApiParam({ name: 'id', description: 'Property ID' })
  @ApiResponse({ status: 200, description: 'Property updated successfully.', type: PropertyResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid input data.' })
  @ApiResponse({ status: 404, description: 'Property not found.' })
  update(@Param('id') id: string, @Body() updatePropertyDto: UpdatePropertyDto) {
    return this.propertiesService.update(id, updatePropertyDto);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update property status' })
  @ApiParam({ name: 'id', description: 'Property ID' })
  @ApiResponse({ status: 200, description: 'Property status updated successfully.' })
  @ApiResponse({ status: 400, description: 'Invalid status transition.' })
  @ApiResponse({ status: 404, description: 'Property not found.' })
  updateStatus(@Param('id') id: string, @Body('status') status: PropertyStatus, @Request() req) {
    return this.propertiesService.updateStatus(id, status, req.user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a property' })
  @ApiParam({ name: 'id', description: 'Property ID' })
  @ApiResponse({ status: 200, description: 'Property deleted successfully.' })
  @ApiResponse({ status: 404, description: 'Property not found.' })
  remove(@Param('id') id: string) {
    return this.propertiesService.remove(id);
  }
}
