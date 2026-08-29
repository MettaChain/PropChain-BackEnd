import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { getRedisConfig } from '../cache/cache.config';
import { Cron, CronExpression } from '@nestjs/schedule';

/**
 * Redis-backed presence registry that tracks which user sockets are connected
 * across all replicas. Each entry uses a short TTL (30 s) that is refreshed on
 * a heartbeat interval so that entries from crashed / restarted pods expire
 * automatically without manual cleanup.
 *
 * Keys used in Redis
 * ──────────────────
 *   presence:user:{userId}         – HASH  { socketId: replicaId }
 *   presence:socket:{socketId}     – STRING userId               (reverse lookup, TTL)
 *
 * Both keys share the same TTL so they expire together.
 */
@Injectable()
export class RedisPresenceService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisPresenceService.name);
  private readonly redis: Redis;
  private readonly INSTANCE_ID =
    process.env.HOSTNAME || process.env.POD_NAME || `pid-${process.pid}`;

  /** TTL in seconds for presence entries. Refreshed every heartbeat. */
  private static readonly PRESENCE_TTL = 30;

  constructor() {
    const config = getRedisConfig();
    this.redis = new Redis({
      host: config.host,
      port: config.port,
      password: config.password,
      db: config.db,
      retryStrategy: config.retryStrategy as any,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
    });

    this.redis.connect().catch((err) => {
      this.logger.error('Redis presence connection failed', err.stack);
    });
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.redis.quit();
    } catch {
      this.redis.disconnect();
    }
  }

  // ── Registration ──────────────────────────────────────────────────────

  /** Register a socket for a user. Called from handleConnection. */
  async register(userId: string, socketId: string): Promise<void> {
    const pipeline = this.redis.pipeline();
    pipeline.hset(`presence:user:${userId}`, socketId, this.INSTANCE_ID);
    pipeline.expire(`presence:user:${userId}`, RedisPresenceService.PRESENCE_TTL);
    pipeline.set(`presence:socket:${socketId}`, userId, 'EX', RedisPresenceService.PRESENCE_TTL);
    await pipeline.exec();
    this.logger.debug(`Registered socket ${socketId} for user ${userId} on ${this.INSTANCE_ID}`);
  }

  /** Remove a socket. Called from handleDisconnect. */
  async unregister(userId: string, socketId: string): Promise<void> {
    const pipeline = this.redis.pipeline();
    pipeline.hdel(`presence:user:${userId}`, socketId);
    pipeline.del(`presence:socket:${socketId}`);
    await pipeline.exec();
    this.logger.debug(`Unregistered socket ${socketId} for user ${userId}`);
  }

  // ── Heartbeat ─────────────────────────────────────────────────────────

  /** Refresh TTL on a user's presence hash. Called periodically. */
  async heartbeat(userId: string, socketId: string): Promise<void> {
    const pipeline = this.redis.pipeline();
    pipeline.expire(`presence:user:${userId}`, RedisPresenceService.PRESENCE_TTL);
    pipeline.expire(`presence:socket:${socketId}`, RedisPresenceService.PRESENCE_TTL);
    await pipeline.exec();
  }

  // ── Queries ───────────────────────────────────────────────────────────

  /** Check whether a user has at least one connected socket (any replica). */
  async isUserConnected(userId: string): Promise<boolean> {
    const count = await this.redis.hlen(`presence:user:${userId}`);
    return count > 0;
  }

  /** Return all socket IDs for a user across all replicas. */
  async getUserSocketIds(userId: string): Promise<string[]> {
    const entries = await this.redis.hgetall(`presence:user:${userId}`);
    return Object.keys(entries);
  }

  /** Look up the userId from a socket ID. */
  async getUserIdBySocket(socketId: string): Promise<string | null> {
    return this.redis.get(`presence:socket:${socketId}`);
  }

  /** Count all connected sockets on this replica. */
  async getLocalSocketCount(): Promise<number> {
    const keys = await this.redis.keys('presence:socket:*');
    return keys.length;
  }

  // ── Periodic hygiene ──────────────────────────────────────────────────

  /**
   * Sweep for orphaned user entries where all sockets have expired but the
   * hash key lingers (can happen after a Redis restart or pipeline failure).
   * Runs every minute via @Cron.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async cleanupStaleEntries(): Promise<void> {
    try {
      const keys = await this.redis.keys('presence:user:*');
      let cleaned = 0;

      for (const key of keys) {
        const entries = await this.redis.hgetall(key);
        // If the hash is empty (all socket entries expired), delete the key
        if (Object.keys(entries).length === 0) {
          await this.redis.del(key);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        this.logger.log(`Cleaned up ${cleaned} stale presence entries`);
      }
    } catch (err) {
      this.logger.warn(`Stale entry cleanup failed: ${err}`);
    }
  }
}
