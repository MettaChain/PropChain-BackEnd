import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AmenityManagementService } from './amenity-management.service';
import {
  AmenityQueryDto,
  AssignPropertyAmenitiesDto,
  CreateAmenityDto,
} from './dto/amenity.dto';

@ApiTags('amenity-management')
@Controller('amenities')
export class AmenityManagementController {
  constructor(private readonly amenityManagementService: AmenityManagementService) {}

  @Post()
  @ApiOperation({ summary: 'Create a custom amenity' })
  create(@Body() dto: CreateAmenityDto) {
    return this.amenityManagementService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List and filter amenities' })
  list(@Query() query: AmenityQueryDto) {
    return this.amenityManagementService.list(query);
  }

  @Get('grouped')
  @ApiOperation({ summary: 'List amenities grouped by category' })
  grouped() {
    return this.amenityManagementService.grouped();
  }

  @Get('autocomplete')
  @ApiOperation({ summary: 'Search amenity names for autocomplete' })
  autocomplete(@Query('q') search = '') {
    return this.amenityManagementService.autocomplete(search);
  }

  @Get('properties/:propertyId')
  @ApiOperation({ summary: 'List amenities assigned to a property' })
  getPropertyAmenities(@Param('propertyId', new ParseUUIDPipe()) propertyId: string) {
    return this.amenityManagementService.getPropertyAmenities(propertyId);
  }

  @Post('properties/:propertyId/assign')
  @ApiOperation({ summary: 'Assign amenities to a property' })
  assign(
    @Param('propertyId', new ParseUUIDPipe()) propertyId: string,
    @Body() dto: AssignPropertyAmenitiesDto,
  ) {
    return this.amenityManagementService.assign(propertyId, dto);
  }
}
