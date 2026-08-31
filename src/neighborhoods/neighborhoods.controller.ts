import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { NeighborhoodsService } from './neighborhoods.service';
import {
  AmenityDto,
  CreateNeighborhoodDto,
  LinkPropertyDto,
  ListNeighborhoodsQueryDto,
  SchoolDto,
  UpdateNeighborhoodDto,
} from './dto/neighborhood.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../types/prisma.types';

@Controller('neighborhoods')
export class NeighborhoodsController {
  constructor(private readonly service: NeighborhoodsService) {}

  // ----- Neighborhood CRUD -----

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post()
  create(@Body() dto: CreateNeighborhoodDto) {
    return this.service.create(dto);
  }

  @Get()
  list(@Query() query: ListNeighborhoodsQueryDto) {
    return this.service.list(query);
  }

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Put(':id')
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateNeighborhoodDto) {
    return this.service.update(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Delete(':id')
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.remove(id);
  }

  // ----- Schools subresource -----

  @Get(':id/schools')
  listSchools(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.listSchools(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post(':id/schools')
  addSchool(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: SchoolDto) {
    return this.service.addSchool(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Delete(':id/schools/:schoolId')
  removeSchool(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('schoolId', new ParseUUIDPipe()) schoolId: string,
  ) {
    return this.service.removeSchool(id, schoolId);
  }

  // ----- Amenities subresource -----

  @Get(':id/amenities')
  listAmenities(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('category') category?: string,
  ) {
    return this.service.listAmenities(id, category);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post(':id/amenities')
  addAmenity(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: AmenityDto) {
    return this.service.addAmenity(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Delete(':id/amenities/:amenityId')
  removeAmenity(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('amenityId', new ParseUUIDPipe()) amenityId: string,
  ) {
    return this.service.removeAmenity(id, amenityId);
  }

  // ----- Property linkage -----

  @Get('property/:propertyId')
  getForProperty(@Param('propertyId', new ParseUUIDPipe()) propertyId: string) {
    return this.service.getForProperty(propertyId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.AGENT)
  @Patch('property/:propertyId')
  linkProperty(
    @Param('propertyId', new ParseUUIDPipe()) propertyId: string,
    @Body() dto: LinkPropertyDto,
  ) {
    return this.service.linkProperty(propertyId, dto.neighborhoodId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.AGENT)
  @Delete('property/:propertyId')
  unlinkProperty(@Param('propertyId', new ParseUUIDPipe()) propertyId: string) {
    return this.service.unlinkProperty(propertyId);
  }
}
