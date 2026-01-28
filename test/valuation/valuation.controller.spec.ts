import { Test, TestingModule } from '@nestjs/testing';
import { ValuationController } from '../../src/valuation/valuation.controller';
import { ValuationService } from '../../src/valuation/valuation.service';

describe('ValuationController', () => {
  let controller: ValuationController;
  let service: ValuationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ValuationController],
      providers: [
        {
          provide: ValuationService,
          useValue: {
            getValuation: jest.fn(),
            getPropertyHistory: jest.fn(),
            getMarketTrendAnalysis: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<ValuationController>(ValuationController);
    service = module.get<ValuationService>(ValuationService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getValuation', () => {
    it('should call valuation service to get property valuation', async () => {
      const propertyId = 'test-property-id';
      const features = { location: 'Test Location', bedrooms: 3 };
      const expectedResult = {
        propertyId,
        estimatedValue: 500000,
        confidenceScore: 0.85,
        valuationDate: new Date(),
        source: 'combined',
      };

      jest.spyOn(service, 'getValuation').mockResolvedValue(expectedResult);

      const result = await controller.getValuation(propertyId, features);

      expect(service.getValuation).toHaveBeenCalledWith(propertyId, features);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('getPropertyHistory', () => {
    it('should call valuation service to get property history', async () => {
      const propertyId = 'test-property-id';
      const expectedResult = [{
        propertyId,
        estimatedValue: 500000,
        confidenceScore: 0.85,
        valuationDate: new Date(),
        source: 'combined',
      }];

      jest.spyOn(service, 'getPropertyHistory').mockResolvedValue(expectedResult);

      const result = await controller.getPropertyHistory(propertyId);

      expect(service.getPropertyHistory).toHaveBeenCalledWith(propertyId);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('getMarketTrendAnalysis', () => {
    it('should call valuation service to get market trend analysis', async () => {
      const location = 'Test Location';
      const expectedResult = {
        location,
        trendData: [],
        trendDirection: 'upward',
      };

      jest.spyOn(service, 'getMarketTrendAnalysis').mockResolvedValue(expectedResult);

      const result = await controller.getMarketTrendAnalysis(location);

      expect(service.getMarketTrendAnalysis).toHaveBeenCalledWith(location);
      expect(result).toEqual(expectedResult);
    });
  });
});