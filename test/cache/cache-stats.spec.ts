import { Test, TestingModule } from '@nestjs/testing';
import { CacheMonitoringService } from '../../src/cache/cache-monitoring.service';
import { CacheStatsController } from '../../src/cache/cache-stats.controller';
import { CacheService } from '../../src/cache/cache.service';
import { CacheHeadersInterceptor } from '../../src/cache/cache-headers.interceptor';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';
import { JwtAuthGuard } from '../../src/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../src/auth/guards/roles.guard';

const allowAll = { canActivate: () => true };

describe('CacheStatsController', () => {
  let controller: CacheStatsController;
  let monitoring: CacheMonitoringService;
  let cacheService: jest.Mocked<CacheService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CacheStatsController],
      providers: [
        CacheMonitoringService,
        { provide: CacheService, useValue: { clear: jest.fn(), getStats: jest.fn() } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(allowAll)
      .overrideGuard(RolesGuard)
      .useValue(allowAll)
      .compile();

    controller = module.get(CacheStatsController);
    monitoring = module.get(CacheMonitoringService);
    cacheService = module.get(CacheService);
  });

  it('returns cache metrics', () => {
    monitoring.recordHit();
    monitoring.recordMiss();
    const stats = controller.getStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
    expect(stats.totalRequests).toBe(2);
  });

  it('clears cache and resets metrics', async () => {
    monitoring.recordHit();
    await controller.clearCache();
    expect(cacheService.clear).toHaveBeenCalled();
    expect(controller.getStats().totalRequests).toBe(0);
  });
});

describe('CacheHeadersInterceptor', () => {
  it('sets cache headers on response', (done) => {
    const interceptor = new CacheHeadersInterceptor();
    const mockRes = { setHeader: jest.fn() };
    const ctx = {
      switchToHttp: () => ({ getResponse: () => mockRes }),
    } as unknown as ExecutionContext;
    const next: CallHandler = { handle: () => of('data') };

    interceptor.intercept(ctx, next).subscribe(() => {
      expect(mockRes.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=60');
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'X-Cache-Time',
        expect.stringMatching(/\d+ms/),
      );
      done();
    });
  });
});
