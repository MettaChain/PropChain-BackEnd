/**
 * Cache Headers Interceptor Tests
 * Tests header generation including error status detection
 */

import { Test, TestingModule } from '@nestjs/testing';
import { CacheHeadersInterceptor } from './cache-headers.interceptor';
import { CacheMonitoringService } from './cache-monitoring.service';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';

describe('CacheHeadersInterceptor', () => {
  let interceptor: CacheHeadersInterceptor;
  let monitoringService: jest.Mocked<CacheMonitoringService>;

  beforeEach(async () => {
    const mockMonitoringService = {
      recordHit: jest.fn(),
      recordMiss: jest.fn(),
      recordError: jest.fn(),
      recordResponseTime: jest.fn(),
      getMetrics: jest.fn(),
      resetMetrics: jest.fn(),
      getAlerts: jest.fn(),
      logSummary: jest.fn(),
    } as unknown as jest.Mocked<CacheMonitoringService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CacheHeadersInterceptor,
        {
          provide: CacheMonitoringService,
          useValue: mockMonitoringService,
        },
      ],
    }).compile();

    interceptor = module.get<CacheHeadersInterceptor>(CacheHeadersInterceptor);
    monitoringService = module.get(CacheMonitoringService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const createMockContext = (path: string = '/test', contentType?: string): ExecutionContext => {
    const mockRequest = {
      path,
      headers: {},
    };
    const mockResponse = {
      setHeader: jest.fn(),
      getHeader: jest.fn((header: string) => {
        if (header === 'content-type') return contentType;
        return undefined;
      }),
    };

    return {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: () => mockRequest,
        getResponse: () => mockResponse,
      }),
    } as unknown as ExecutionContext;
  };

  const createMockCallHandler = (): CallHandler => {
    return {
      handle: () => of({ data: 'test' }),
    };
  };

  describe('intercept', () => {
    it('should set cache headers with normal status when error rate is low', async () => {
      monitoringService.getMetrics.mockReturnValue({
        hits: 80,
        misses: 20,
        errors: 0,
        hitRate: 80,
        totalRequests: 100,
        avgResponseTime: 50,
        timestamp: new Date(),
      });

      const context = createMockContext('/api/test');
      const handler = createMockCallHandler();

      await interceptor.intercept(context, handler).toPromise();

      const mockResponse = context.switchToHttp().getResponse();
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-Cache', 'hit');
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-Cache-Hit-Rate', '80.00%');
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-Cache-Error-Rate', '0.00%');
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-Cache-Time', expect.stringMatching(/\d+ms/));
    });

    it('should set cache headers with error status when error rate is high', async () => {
      monitoringService.getMetrics.mockReturnValue({
        hits: 10,
        misses: 10,
        errors: 80,
        hitRate: 10,
        totalRequests: 100,
        avgResponseTime: 50,
        timestamp: new Date(),
      });

      const context = createMockContext('/api/test');
      const handler = createMockCallHandler();

      await interceptor.intercept(context, handler).toPromise();

      const mockResponse = context.switchToHttp().getResponse();
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-Cache', 'error');
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-Cache-Hit-Rate', '10.00%');
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-Cache-Error-Rate', '80.00%');
    });

    it('should set cache headers with miss status when hit rate is low', async () => {
      monitoringService.getMetrics.mockReturnValue({
        hits: 20,
        misses: 80,
        errors: 0,
        hitRate: 20,
        totalRequests: 100,
        avgResponseTime: 50,
        timestamp: new Date(),
      });

      const context = createMockContext('/api/test');
      const handler = createMockCallHandler();

      await interceptor.intercept(context, handler).toPromise();

      const mockResponse = context.switchToHttp().getResponse();
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-Cache', 'miss');
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-Cache-Hit-Rate', '20.00%');
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-Cache-Error-Rate', '0.00%');
    });

    it('should set appropriate cache headers for image responses', async () => {
      monitoringService.getMetrics.mockReturnValue({
        hits: 50,
        misses: 50,
        errors: 0,
        hitRate: 50,
        totalRequests: 100,
        avgResponseTime: 50,
        timestamp: new Date(),
      });

      const context = createMockContext('/uploads/image.jpg', 'image/jpeg');
      const handler = createMockCallHandler();

      await interceptor.intercept(context, handler).toPromise();

      const mockResponse = context.switchToHttp().getResponse();
      expect(mockResponse.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=3600');
      expect(mockResponse.setHeader).toHaveBeenCalledWith('Vary', 'Accept');
    });

    it('should set appropriate cache headers for different image formats', async () => {
      monitoringService.getMetrics.mockReturnValue({
        hits: 50,
        misses: 50,
        errors: 0,
        hitRate: 50,
        totalRequests: 100,
        avgResponseTime: 50,
        timestamp: new Date(),
      });

      const avifContext = createMockContext('/uploads/image.avif', 'image/avif');
      const avifHandler = createMockCallHandler();

      await interceptor.intercept(avifContext, avifHandler).toPromise();

      const mockResponse = avifContext.switchToHttp().getResponse();
      expect(mockResponse.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=2592000');
    });

    it('should set default cache headers for non-image responses', async () => {
      monitoringService.getMetrics.mockReturnValue({
        hits: 50,
        misses: 50,
        errors: 0,
        hitRate: 50,
        totalRequests: 100,
        avgResponseTime: 50,
        timestamp: new Date(),
      });

      const context = createMockContext('/api/data');
      const handler = createMockCallHandler();

      await interceptor.intercept(context, handler).toPromise();

      const mockResponse = context.switchToHttp().getResponse();
      expect(mockResponse.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=60');
    });

    it('should handle zero total requests gracefully', async () => {
      monitoringService.getMetrics.mockReturnValue({
        hits: 0,
        misses: 0,
        errors: 0,
        hitRate: 0,
        totalRequests: 0,
        avgResponseTime: 0,
        timestamp: new Date(),
      });

      const context = createMockContext('/api/test');
      const handler = createMockCallHandler();

      await interceptor.intercept(context, handler).toPromise();

      const mockResponse = context.switchToHttp().getResponse();
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-Cache', 'miss');
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-Cache-Hit-Rate', '0.00%');
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-Cache-Error-Rate', '0.00%');
    });

    it('should set response time header', async () => {
      monitoringService.getMetrics.mockReturnValue({
        hits: 50,
        misses: 50,
        errors: 0,
        hitRate: 50,
        totalRequests: 100,
        avgResponseTime: 50,
        timestamp: new Date(),
      });

      const context = createMockContext('/api/test');
      const handler = createMockCallHandler();

      await interceptor.intercept(context, handler).toPromise();

      const mockResponse = context.switchToHttp().getResponse();
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-Cache-Time', expect.stringMatching(/\d+ms/));
    });
  });
});
