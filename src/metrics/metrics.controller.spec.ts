import { Test, TestingModule } from '@nestjs/testing';
import { MetricsController } from './metrics.controller';

jest.mock('prom-client', () => ({
  collectDefaultMetrics: jest.fn(),
  register: { metrics: jest.fn().mockResolvedValue(''), contentType: 'text/plain' },
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
});