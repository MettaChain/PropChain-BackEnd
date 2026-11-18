import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CreateMaintenanceRequestDto,
  MaintenanceQueryDto,
  UpdateMaintenanceRequestDto,
} from './dto/maintenance-request.dto';
import { MaintenanceTrackingService } from './maintenance-tracking.service';

@ApiTags('maintenance-tracking')
@Controller('maintenance-requests')
export class MaintenanceTrackingController {
  constructor(private readonly maintenanceTrackingService: MaintenanceTrackingService) {}

  @Post()
  @ApiOperation({ summary: 'Create a maintenance request' })
  create(@Body() dto: CreateMaintenanceRequestDto) {
    return this.maintenanceTrackingService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List maintenance requests' })
  findAll(@Query() query: MaintenanceQueryDto) {
    return this.maintenanceTrackingService.findAll(query);
  }

  @Get('property/:propertyId/history')
  @ApiOperation({ summary: 'Get maintenance history for a property' })
  getHistory(@Param('propertyId', new ParseUUIDPipe()) propertyId: string) {
    return this.maintenanceTrackingService.getHistory(propertyId);
  }

  @Get('property/:propertyId/summary')
  @ApiOperation({ summary: 'Get maintenance cost and status summary for a property' })
  getSummary(@Param('propertyId', new ParseUUIDPipe()) propertyId: string) {
    return this.maintenanceTrackingService.getSummary(propertyId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a maintenance request' })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.maintenanceTrackingService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a maintenance request' })
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateMaintenanceRequestDto) {
    return this.maintenanceTrackingService.update(id, dto);
  }
}
