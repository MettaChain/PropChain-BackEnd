import { Test, TestingModule } from '@nestjs/testing';
import { MonitoringService } from './monitoring.service';
import { PrismaService } from '../database/prisma.service';

const mockPrisma = {
  apiRequestLog: {
    count: jest.fn(),
    groupBy: jest.fn(),
  },
};

describe('MonitoringService', () => {
  let service: MonitoringService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MonitoringService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<MonitoringService>(MonitoringService);
    jest.clearAllMocks();
  });

  describe('getRequestCounts', () => {
    it('should return total and breakdown by method and status', async () => {
      mockPrisma.apiRequestLog.count.mockResolvedValue(100);
      mockPrisma.apiRequestLog.groupBy
        .mockResolvedValueOnce([{ method: 'GET', _count: { method: 80 } }])
        .mockResolvedValueOnce([{ statusCode: 200, _count: { statusCode: 90 } }]);

      const result = await service.getRequestCounts();

      expect(result.total).toBe(100);
      expect(result.byMethod[0]).toEqual({ method: 'GET', count: 80 });
      expect(result.byStatus[0]).toEqual({ statusCode: 200, count: 90 });
    });
  });

  describe('getErrorRates', () => {
    it('should calculate error rate correctly', async () => {
      mockPrisma.apiRequestLog.count
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(10);
      mockPrisma.apiRequestLog.groupBy.mockResolvedValue([]);

      const result = await service.getErrorRates();

      expect(result.total).toBe(100);
      expect(result.errors).toBe(10);
      expect(result.errorRate).toBe('10.00%');
    });

    it('should return 0% error rate when no requests', async () => {
      mockPrisma.apiRequestLog.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      mockPrisma.apiRequestLog.groupBy.mockResolvedValue([]);

      const result = await service.getErrorRates();
      expect(result.errorRate).toBe('0%');
    });
  });

  describe('getSlowEndpoints', () => {
    it('should return slow request count and slowest endpoints', async () => {
      mockPrisma.apiRequestLog.count.mockResolvedValue(5);
      mockPrisma.apiRequestLog.groupBy.mockResolvedValue([
        {
          method: 'GET',
          path: '/api/properties',
          _avg: { responseTime: 2000 },
          _max: { responseTime: 3500 },
          _count: { path: 5 },
        },
      ]);

      const result = await service.getSlowEndpoints(1000);

      expect(result.slowRequestCount).toBe(5);
      expect(result.slowestEndpoints[0].avgResponseTimeMs).toBe(2000);
      expect(result.slowestEndpoints[0].path).toBe('/api/properties');
    });
  });

  describe('getUsageByUser', () => {
    it('should return usage grouped by user', async () => {
      mockPrisma.apiRequestLog.groupBy.mockResolvedValue([
        { userId: 'user-1', _count: { userId: 50 }, _avg: { responseTime: 120 } },
        { userId: 'user-2', _count: { userId: 30 }, _avg: { responseTime: 200 } },
      ]);

      const result = await service.getUsageByUser();

      expect(result).toHaveLength(2);
      expect(result[0].userId).toBe('user-1');
      expect(result[0].requestCount).toBe(50);
      expect(result[0].avgResponseTimeMs).toBe(120);
    });
  });

  describe('getSummary', () => {
    it('should return a combined summary for last 24h', async () => {
      mockPrisma.apiRequestLog.count.mockResolvedValue(50);
      mockPrisma.apiRequestLog.groupBy.mockResolvedValue([]);

      const result = await service.getSummary();

      expect(result.period).toBe('last_24h');
      expect(result).toHaveProperty('requestCounts');
      expect(result).toHaveProperty('errorRates');
      expect(result).toHaveProperty('slowEndpoints');
    });
  });
});