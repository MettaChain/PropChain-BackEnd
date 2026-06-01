import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  CacheWarmingService,
  WarmupTask,
  WarmupStrategy,
} from '../../src/common/cache/cache-warming.service';
import { MultiLevelCacheService } from '../../src/common/cache/multi-level-cache.service';

describe('CacheWarmingService', () => {
  let service: CacheWarmingService;
  let cacheService: jest.Mocked<MultiLevelCacheService>;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    const mockCacheService = {
      get: jest.fn(),
      set: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn().mockImplementation((key: string, defaultValue?: any) => defaultValue),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CacheWarmingService,
        { provide: MultiLevelCacheService, useValue: mockCacheService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<CacheWarmingService>(CacheWarmingService);
    cacheService = module.get(MultiLevelCacheService);
    configService = module.get(ConfigService);

    await service.onModuleInit();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('onModuleInit', () => {
    it('should initialize with default strategies', async () => {
      const strategies = service.getStrategies();
      expect(strategies.length).toBeGreaterThan(0);
      expect(strategies.some((s) => s.name === 'user-data')).toBe(true);
      expect(strategies.some((s) => s.name === 'property-data')).toBe(true);
    });
  });

  describe('registerStrategy', () => {
    it('should register a new strategy', () => {
      const strategy: WarmupStrategy = {
        name: 'test-strategy',
        description: 'Test strategy',
        tasks: [],
        enabled: true,
      };

      service.registerStrategy(strategy);

      expect(service.getStrategy('test-strategy')).toEqual(strategy);
    });
  });

  describe('unregisterStrategy', () => {
    it('should unregister a strategy', () => {
      const strategy: WarmupStrategy = {
        name: 'temp-strategy',
        description: 'Temp strategy',
        tasks: [],
        enabled: true,
      };

      service.registerStrategy(strategy);
      const result = service.unregisterStrategy('temp-strategy');

      expect(result).toBe(true);
      expect(service.getStrategy('temp-strategy')).toBeUndefined();
    });

    it('should return false for non-existent strategy', () => {
      const result = service.unregisterStrategy('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('setStrategyEnabled', () => {
    it('should enable/disable a strategy', () => {
      const strategy: WarmupStrategy = {
        name: 'toggle-strategy',
        description: 'Toggle strategy',
        tasks: [],
        enabled: true,
      };

      service.registerStrategy(strategy);

      let result = service.setStrategyEnabled('toggle-strategy', false);
      expect(result).toBe(true);
      expect(service.getStrategy('toggle-strategy')?.enabled).toBe(false);

      result = service.setStrategyEnabled('toggle-strategy', true);
      expect(result).toBe(true);
      expect(service.getStrategy('toggle-strategy')?.enabled).toBe(true);
    });

    it('should return false for non-existent strategy', () => {
      const result = service.setStrategyEnabled('non-existent', false);
      expect(result).toBe(false);
    });
  });

  describe('executeStrategy', () => {
    it('should execute a strategy and cache results', async () => {
      const factory = jest.fn().mockResolvedValue({ data: 'test' });
      const strategy: WarmupStrategy = {
        name: 'exec-strategy',
        description: 'Exec strategy',
        tasks: [
          {
            key: 'test:key',
            factory,
            priority: 5,
          },
        ],
        enabled: true,
      };

      service.registerStrategy(strategy);
      cacheService.get.mockResolvedValue(undefined);

      await service.executeStrategy('exec-strategy');

      expect(factory).toHaveBeenCalled();
      expect(cacheService.set).toHaveBeenCalledWith('test:key', { data: 'test' }, undefined);
    });

    it('should skip already cached entries', async () => {
      const factory = jest.fn().mockResolvedValue({ data: 'test' });
      const strategy: WarmupStrategy = {
        name: 'skip-strategy',
        description: 'Skip strategy',
        tasks: [
          {
            key: 'cached:key',
            factory,
            priority: 5,
          },
        ],
        enabled: true,
      };

      service.registerStrategy(strategy);
      cacheService.get.mockResolvedValue({ data: 'existing' });

      await service.executeStrategy('skip-strategy');

      expect(factory).not.toHaveBeenCalled();
      expect(cacheService.set).not.toHaveBeenCalled();
    });

    it('should skip disabled strategies', async () => {
      const strategy: WarmupStrategy = {
        name: 'disabled-strategy',
        description: 'Disabled strategy',
        tasks: [
          {
            key: 'test:key',
            factory: jest.fn(),
            priority: 5,
          },
        ],
        enabled: false,
      };

      service.registerStrategy(strategy);

      await service.executeStrategy('disabled-strategy');

      expect(cacheService.get).not.toHaveBeenCalled();
    });

    it('should handle factory errors gracefully', async () => {
      const factory = jest.fn().mockRejectedValue(new Error('Factory error'));
      const strategy: WarmupStrategy = {
        name: 'error-strategy',
        description: 'Error strategy',
        tasks: [
          {
            key: 'error:key',
            factory,
            priority: 5,
          },
        ],
        enabled: true,
      };

      service.registerStrategy(strategy);
      cacheService.get.mockResolvedValue(undefined);

      await service.executeStrategy('error-strategy');

      expect(factory).toHaveBeenCalled();
      expect(cacheService.set).not.toHaveBeenCalled();
    });
  });

  describe('executeAllStrategies', () => {
    it('should execute all enabled strategies', async () => {
      const mockSet = jest.fn();
      cacheService.set = mockSet;

      for (const s of service.getStrategies()) {
        service.setStrategyEnabled(s.name, false);
      }

      const strategy1: WarmupStrategy = {
        name: 'strategy1',
        description: 'Strategy 1',
        tasks: [
          {
            key: 'key1',
            factory: jest.fn().mockResolvedValue('value1'),
            priority: 5,
          },
        ],
        enabled: true,
      };

      const strategy2: WarmupStrategy = {
        name: 'strategy2',
        description: 'Strategy 2',
        tasks: [
          {
            key: 'key2',
            factory: jest.fn().mockResolvedValue('value2'),
            priority: 5,
          },
        ],
        enabled: true,
      };

      const disabledStrategy: WarmupStrategy = {
        name: 'disabled',
        description: 'Disabled',
        tasks: [
          {
            key: 'key3',
            factory: jest.fn(),
            priority: 5,
          },
        ],
        enabled: false,
      };

      service.registerStrategy(strategy1);
      service.registerStrategy(strategy2);
      service.registerStrategy(disabledStrategy);

      cacheService.get.mockResolvedValue(undefined);

      await service.executeAllStrategies();

      expect(mockSet).toHaveBeenCalledTimes(2);
    });
  });

  describe('executeTask', () => {
    it('should execute a single task', async () => {
      const task: WarmupTask = {
        key: 'single:key',
        factory: jest.fn().mockResolvedValue({ data: 'test' }),
        priority: 5,
      };

      cacheService.get.mockResolvedValue(undefined);

      const result = await service.executeTask(task);

      expect(result).toBe(true);
      expect(cacheService.set).toHaveBeenCalled();
    });

    it('should return false if condition not met', async () => {
      const task: WarmupTask = {
        key: 'conditional:key',
        factory: jest.fn(),
        priority: 5,
        condition: () => false,
      };

      const result = await service.executeTask(task);

      expect(result).toBe(false);
      expect(cacheService.set).not.toHaveBeenCalled();
    });

    it('should return false if already cached', async () => {
      const task: WarmupTask = {
        key: 'cached:key',
        factory: jest.fn(),
        priority: 5,
      };

      cacheService.get.mockResolvedValue({ data: 'existing' });

      const result = await service.executeTask(task);

      expect(result).toBe(false);
      expect(cacheService.set).not.toHaveBeenCalled();
    });

    it('should return false on factory error', async () => {
      const task: WarmupTask = {
        key: 'error:key',
        factory: jest.fn().mockRejectedValue(new Error('Factory error')),
        priority: 5,
      };

      cacheService.get.mockResolvedValue(undefined);

      const result = await service.executeTask(task);

      expect(result).toBe(false);
    });
  });

  describe('warmCache', () => {
    it('should warm cache with multiple tasks', async () => {
      const tasks: WarmupTask[] = [
        {
          key: 'key1',
          factory: jest.fn().mockResolvedValue('value1'),
          priority: 5,
        },
        {
          key: 'key2',
          factory: jest.fn().mockResolvedValue('value2'),
          priority: 3,
        },
      ];

      cacheService.get.mockResolvedValue(undefined);

      const result = await service.warmCache(tasks);

      expect(result.completed).toBe(2);
      expect(result.failed).toBe(0);
    });

    it('should sort tasks by priority', async () => {
      const executionOrder: string[] = [];

      const tasks: WarmupTask[] = [
        {
          key: 'low',
          factory: jest.fn().mockImplementation(async () => {
            executionOrder.push('low');
            return 'value';
          }),
          priority: 1,
        },
        {
          key: 'high',
          factory: jest.fn().mockImplementation(async () => {
            executionOrder.push('high');
            return 'value';
          }),
          priority: 10,
        },
      ];

      cacheService.get.mockResolvedValue(undefined);

      await service.warmCache(tasks);

      expect(executionOrder[0]).toBe('high');
      expect(executionOrder[1]).toBe('low');
    });
  });

  describe('getStats', () => {
    it('should return warming statistics', () => {
      const stats = service.getStats();

      expect(stats).toHaveProperty('totalTasks');
      expect(stats).toHaveProperty('completedTasks');
      expect(stats).toHaveProperty('failedTasks');
      expect(stats).toHaveProperty('skippedTasks');
      expect(stats).toHaveProperty('averageExecutionTime');
    });
  });

  describe('resetStats', () => {
    it('should reset all statistics', async () => {
      const strategy: WarmupStrategy = {
        name: 'stats-strategy',
        description: 'Stats strategy',
        tasks: [
          {
            key: 'key1',
            factory: jest.fn().mockResolvedValue('value'),
            priority: 5,
          },
        ],
        enabled: true,
      };

      service.registerStrategy(strategy);
      cacheService.get.mockResolvedValue(undefined);

      await service.executeStrategy('stats-strategy');

      service.resetStats();

      const stats = service.getStats();
      expect(stats.totalTasks).toBe(0);
      expect(stats.completedTasks).toBe(0);
    });
  });

  describe('getStrategies', () => {
    it('should return all registered strategies', () => {
      const strategies = service.getStrategies();

      expect(Array.isArray(strategies)).toBe(true);
      expect(strategies.length).toBeGreaterThan(0);
    });
  });

  describe('getStrategy', () => {
    it('should return a specific strategy', () => {
      const strategy = service.getStrategy('user-data');

      expect(strategy).toBeDefined();
      expect(strategy?.name).toBe('user-data');
    });

    it('should return undefined for non-existent strategy', () => {
      const strategy = service.getStrategy('non-existent');

      expect(strategy).toBeUndefined();
    });
  });

  describe('prewarmOnStartup', () => {
    it('should prewarm critical strategies', async () => {
      cacheService.get.mockResolvedValue(undefined);

      await service.prewarmOnStartup();

      expect(cacheService.get).toHaveBeenCalled();
    });
  });
});
