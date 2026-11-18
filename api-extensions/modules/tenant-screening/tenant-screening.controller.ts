import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateScreeningDto } from './dto/tenant-screening.dto';
import { TenantScreeningService } from './tenant-screening.service';

@ApiTags('tenant-screening')
@Controller('tenant-screenings')
export class TenantScreeningController {
  constructor(private readonly tenantScreeningService: TenantScreeningService) {}

  @Post()
  @ApiOperation({ summary: 'Create a tenant screening request' })
  create(@Body() dto: CreateScreeningDto) {
    return this.tenantScreeningService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List tenant screening requests' })
  findAll(@Query('propertyId') propertyId?: string) {
    return this.tenantScreeningService.findAll(propertyId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a tenant screening result' })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.tenantScreeningService.findOne(id);
  }

  @Post(':id/process')
  @ApiOperation({ summary: 'Run screening checks and return the recommendation' })
  process(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.tenantScreeningService.process(id);
  }
}
