import { RedisPresenceService } from './redis-presence.service';

// Mock ioredis at the module level
const mockPipeline = {
  hset: jest.fn().mockReturnThis(),
  hdel: jest.fn().mockReturnThis(),
  set: jest.fn().mockReturnThis(),
  expire: jest.fn().mockReturnThis(),
  del: jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue([]),
};

const mockRedis = {
  connect: jest.fn().mockResolvedValue(undefined),
  quit: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn(),
  hset: jest.fn().mockResolvedValue(1),
  hdel: jest.fn().mockResolvedValue(1),
  hlen: jest.fn().mockResolvedValue(1),
  hgetall: jest.fn().mockResolvedValue({}),
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  keys: jest.fn().mockResolvedValue([]),
  pipeline: jest.fn().mockReturnValue(mockPipeline),
  duplicate: jest.fn().mockReturnValue({
    connect: jest.fn().mockResolvedValue(undefined),
  }),
};

jest.mock('ioredis', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => mockRedis),
  };
});

jest.mock('../cache/cache.config', () => ({
  getRedisConfig: jest.fn().mockReturnValue({
    host: 'localhost',
    port: 6379,
    password: undefined,
    db: 0,
    retryStrategy: () => 100,
  }),
}));

describe('RedisPresenceService', () => {
  let service: RedisPresenceService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RedisPresenceService();
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  describe('register', () => {
    it('sets the user hash and reverse-lookup key with TTL', async () => {
      await service.register('user-1', 'socket-1');

      expect(mockRedis.pipeline).toHaveBeenCalled();
      expect(mockPipeline.hset).toHaveBeenCalledWith(
        'presence:user:user-1',
        'socket-1',
        expect.any(String),
      );
      expect(mockPipeline.expire).toHaveBeenCalledWith('presence:user:user-1', 30);
      expect(mockPipeline.set).toHaveBeenCalledWith('presence:socket:socket-1', 'user-1', 'EX', 30);
      expect(mockPipeline.exec).toHaveBeenCalled();
    });
  });

  describe('unregister', () => {
    it('removes the socket from the user hash and deletes the reverse key', async () => {
      await service.unregister('user-1', 'socket-1');

      expect(mockRedis.pipeline).toHaveBeenCalled();
      expect(mockPipeline.hdel).toHaveBeenCalledWith('presence:user:user-1', 'socket-1');
      expect(mockPipeline.del).toHaveBeenCalledWith('presence:socket:socket-1');
      expect(mockPipeline.exec).toHaveBeenCalled();
    });
  });

  describe('heartbeat', () => {
    it('refreshes TTL on both keys', async () => {
      await service.heartbeat('user-1', 'socket-1');

      expect(mockPipeline.expire).toHaveBeenCalledWith('presence:user:user-1', 30);
      expect(mockPipeline.expire).toHaveBeenCalledWith('presence:socket:socket-1', 30);
    });
  });

  describe('isUserConnected', () => {
    it('returns true when the user hash has entries', async () => {
      mockRedis.hlen.mockResolvedValue(2);
      const result = await service.isUserConnected('user-1');
      expect(result).toBe(true);
      expect(mockRedis.hlen).toHaveBeenCalledWith('presence:user:user-1');
    });

    it('returns false when the user hash is empty', async () => {
      mockRedis.hlen.mockResolvedValue(0);
      const result = await service.isUserConnected('user-99');
      expect(result).toBe(false);
    });
  });

  describe('getUserSocketIds', () => {
    it('returns all socket IDs from the user hash', async () => {
      mockRedis.hgetall.mockResolvedValue({
        'socket-1': 'replica-a',
        'socket-2': 'replica-b',
      });
      const result = await service.getUserSocketIds('user-1');
      expect(result).toEqual(['socket-1', 'socket-2']);
    });

    it('returns empty array when user has no sockets', async () => {
      mockRedis.hgetall.mockResolvedValue({});
      const result = await service.getUserSocketIds('user-99');
      expect(result).toEqual([]);
    });
  });

  describe('getUserIdBySocket', () => {
    it('returns the userId for a known socket', async () => {
      mockRedis.get.mockResolvedValue('user-1');
      const result = await service.getUserIdBySocket('socket-1');
      expect(result).toBe('user-1');
    });

    it('returns null for an unknown socket', async () => {
      mockRedis.get.mockResolvedValue(null);
      const result = await service.getUserIdBySocket('socket-unknown');
      expect(result).toBeNull();
    });
  });

  describe('cleanupStaleEntries', () => {
    it('deletes user keys with empty hashes', async () => {
      mockRedis.keys.mockResolvedValue(['presence:user:user-1', 'presence:user:user-2']);
      mockRedis.hgetall
        .mockResolvedValueOnce({}) // user-1: empty → stale
        .mockResolvedValueOnce({ 'socket-1': 'replica-a' }); // user-2: has entries

      await service.cleanupStaleEntries();

      expect(mockRedis.del).toHaveBeenCalledTimes(1);
      expect(mockRedis.del).toHaveBeenCalledWith('presence:user:user-1');
    });

    it('does nothing when all entries are healthy', async () => {
      mockRedis.keys.mockResolvedValue(['presence:user:user-1']);
      mockRedis.hgetall.mockResolvedValue({ 'socket-1': 'replica-a' });

      await service.cleanupStaleEntries();

      expect(mockRedis.del).not.toHaveBeenCalled();
    });

    it('handles Redis errors gracefully', async () => {
      mockRedis.keys.mockRejectedValue(new Error('Redis down'));

      // Should not throw
      await expect(service.cleanupStaleEntries()).resolves.not.toThrow();
    });
  });
});
