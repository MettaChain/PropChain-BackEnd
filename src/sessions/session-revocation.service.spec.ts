import { SessionRevocationService } from './session-revocation.service';

const mockSub = {
  connect: jest.fn().mockResolvedValue(undefined),
  subscribe: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
  quit: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn(),
};

const mockPub = {
  connect: jest.fn().mockResolvedValue(undefined),
  quit: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn(),
  publish: jest.fn().mockResolvedValue(1),
  duplicate: jest.fn().mockReturnValue(mockSub),
};

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => mockPub),
}));

jest.mock('../cache/cache.config', () => ({
  getRedisConfig: jest.fn().mockReturnValue({
    host: 'localhost',
    port: 6379,
    password: undefined,
    db: 0,
    retryStrategy: () => 100,
  }),
}));

describe('SessionRevocationService (#1294)', () => {
  let service: SessionRevocationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SessionRevocationService();
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  it('notifies local subscribers synchronously', async () => {
    const handler = jest.fn();
    service.subscribe(handler);

    await service.publishRevoked(['sess-1']);

    expect(handler).toHaveBeenCalledWith(['sess-1']);
  });

  it('deduplicates and drops empty session ids', async () => {
    const handler = jest.fn();
    service.subscribe(handler);

    await service.publishRevoked(['sess-1', 'sess-1', '', undefined as unknown as string]);

    expect(handler).toHaveBeenCalledWith(['sess-1']);
  });

  it('does nothing for an empty revocation list', async () => {
    const handler = jest.fn();
    service.subscribe(handler);

    await service.publishRevoked([]);

    expect(handler).not.toHaveBeenCalled();
  });

  it('unsubscribes handlers', async () => {
    const handler = jest.fn();
    const unsubscribe = service.subscribe(handler);
    unsubscribe();

    await service.publishRevoked(['sess-1']);

    expect(handler).not.toHaveBeenCalled();
  });

  it('isolates subscriber exceptions', async () => {
    const bad = jest.fn().mockImplementation(() => {
      throw new Error('boom');
    });
    const good = jest.fn();
    service.subscribe(bad);
    service.subscribe(good);

    await expect(service.publishRevoked(['sess-1'])).resolves.toBeUndefined();
    expect(good).toHaveBeenCalled();
  });
});
