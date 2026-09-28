import { Test, TestingModule } from '@nestjs/testing';
import { MetricsController } from './metrics.controller';

jest.mock('prom-client', () => ({
  collectDefaultMetrics: jest.fn(),
  register: {
    metrics: jest.fn().mockResolvedValue(''),
    contentType: 'text/plain',
    getSingleMetric: jest.fn().mockReturnValue(undefined),
  },
  Counter: jest.fn().mockImplementation(() => ({ inc: jest.fn() })),
  Gauge: jest.fn().mockImplementation(() => ({ set: jest.fn() })),
  Histogram: jest.fn().mockImplementation(() => ({ observe: jest.fn() })),
}));

describe('MetricsController', () => {
  let controller: MetricsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MetricsController],
    }).compile();
    controller = module.get<MetricsController>(MetricsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return metrics with correct content type', async () => {
    const mockRes = {
      setHeader: jest.fn(),
      end: jest.fn(),
    } as any;

    await controller.getMetrics(mockRes);
    expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/plain');
    expect(mockRes.end).toHaveBeenCalled();
  });
});
