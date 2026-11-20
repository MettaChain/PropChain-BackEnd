import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateValuationDto, ValuationResponseDto } from '../../dto/property-valuation.dto';
import { PropertyValuationService } from './property-valuation.service';

export class ValuationQueryDto {
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  refresh?: boolean;
}

@ApiTags('property-valuation')
@Controller('property-valuation')
export class PropertyValuationController {
  constructor(private readonly propertyValuationService: PropertyValuationService) {}

  @Get(':propertyId')
  @ApiOperation({ summary: 'Get an estimated valuation for a property' })
  @ApiOkResponse({ type: ValuationResponseDto })
  getValuation(
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Query() query: ValuationQueryDto,
  ): Promise<ValuationResponseDto> {
    if (query?.refresh) this.propertyValuationService.clearCache(propertyId);
    return this.propertyValuationService.getValuation(propertyId);
  }

  @Post()
  @ApiOperation({ summary: 'Calculate a valuation using supplied comparable sales' })
  @ApiOkResponse({ type: ValuationResponseDto })
  createValuation(@Body() dto: CreateValuationDto): Promise<ValuationResponseDto> {
    return this.propertyValuationService.getValuation(dto.propertyId, dto.comparables);
  }
}
