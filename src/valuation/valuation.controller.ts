import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  ValidationPipe,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBody } from '@nestjs/swagger';
import { ValuationService, PropertyFeatures, ValuationResult } from './valuation.service';


@ApiTags('valuation')
@Controller('valuation')
export class ValuationController {
  private readonly logger = new Logger(ValuationController.name);

  constructor(private readonly valuationService: ValuationService) {}

  @Post(':propertyId')
  @ApiOperation({ summary: 'Get property valuation' })
  @ApiParam({ name: 'propertyId', description: 'ID of the property to value' })
  @ApiBody({ description: 'Property features for valuation', required: false })
  @ApiResponse({ status: 200, description: 'Property valuation successful' })
  @ApiResponse({ status: 404, description: 'Property not found' })
  @ApiResponse({ status: 422, description: 'Invalid property features' })
  @HttpCode(HttpStatus.OK)
  async getValuation(
    @Param('propertyId') propertyId: string,
    @Body(ValidationPipe) features?: PropertyFeatures,
  ): Promise<ValuationResult> {
    this.logger.log(`Requesting valuation for property ${propertyId}`);
    return this.valuationService.getValuation(propertyId, features);
  }

  @Get(':propertyId/history')
  @ApiOperation({ summary: 'Get property valuation history' })
  @ApiParam({ name: 'propertyId', description: 'ID of the property' })
  @ApiResponse({ status: 200, description: 'Property valuation history retrieved' })
  @ApiResponse({ status: 404, description: 'Property not found' })
  async getPropertyHistory(@Param('propertyId') propertyId: string): Promise<ValuationResult[]> {
    this.logger.log(`Requesting valuation history for property ${propertyId}`);
    return this.valuationService.getPropertyHistory(propertyId);
  }

  @Get('trends/:location')
  @ApiOperation({ summary: 'Get market trend analysis for a location' })
  @ApiParam({ name: 'location', description: 'Location to analyze market trends' })
  @ApiResponse({ status: 200, description: 'Market trend analysis retrieved' })
  @ApiResponse({ status: 404, description: 'Location not found in records' })
  async getMarketTrendAnalysis(@Param('location') location: string) {
    this.logger.log(`Requesting market trend analysis for location ${location}`);
    return this.valuationService.getMarketTrendAnalysis(location);
  }

  @Get(':propertyId/latest')
  @ApiOperation({ summary: 'Get latest valuation for a property' })
  @ApiParam({ name: 'propertyId', description: 'ID of the property' })
  @ApiResponse({ status: 200, description: 'Latest valuation retrieved' })
  @ApiResponse({ status: 404, description: 'Property not found' })
  async getLatestValuation(@Param('propertyId') propertyId: string): Promise<ValuationResult> {
    const history = await this.valuationService.getPropertyHistory(propertyId);
    if (history.length === 0) {
      throw new Error(`No valuations found for property ${propertyId}`);
    }
    return history[0]; // Latest is first since ordered by desc date
  }

  @Post('batch')
  @ApiOperation({ summary: 'Get valuations for multiple properties' })
  @ApiBody({
    description: 'Array of property IDs and features',
    schema: {
      type: 'object',
      properties: {
        properties: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              propertyId: { type: 'string' },
              features: { $ref: '#/components/schemas/PropertyFeatures' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Batch valuations retrieved' })
  @HttpCode(HttpStatus.OK)
  async getBatchValuations(@Body() requestBody: { properties: Array<{ propertyId: string; features?: PropertyFeatures }> }) {
    const results = [];
    for (const item of requestBody.properties) {
      try {
        const valuation = await this.valuationService.getValuation(item.propertyId, item.features);
        results.push({ propertyId: item.propertyId, valuation, status: 'success' });
      } catch (error) {
        results.push({ propertyId: item.propertyId, error: error.message, status: 'error' });
      }
    }
    return results;
  }
}