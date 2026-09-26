import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { getRedisConfig } from '../cache/cache.config';

export const SESSION_REVOKED_CHANNEL = 'propchain:session-revoked';

type RevocationHandler = (sessionIds: string[]) => void;

/**
 * Broadcasts session revocations to interested listeners (issue #1294).
 *
 * When a session is revoked, real-time sockets bound to it must be dropped.
 * This service fans the revocation out to:
 *   1. listeners in the same process (synchronous, works even without Redis), and
 *   2. other replicas via a Redis pub/sub channel.
 *
 * Redis failures are logged and swallowed – revocation must never be blocked by
 * an unavailable cache.
 */
@Injectable()
export class SessionRevocationService implements OnModuleDestroy {
  private readonly logger = new Logger(SessionRevocationService.name);
  private readonly handlers = new Set<RevocationHandler>();

  private pub: Redis | null = null;
  private sub: Redis | null = null;
  private connected = false;

  constructor() {
    try {
      const config = getRedisConfig();
      this.pub = new Redis({
        host: config.host,
        port: config.port,
        password: config.password,
        db: config.db,
        retryStrategy: config.retryStrategy as any,
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: true,
      });

      this.pub
        .connect()
        .then(() => this.subscribeToChannel())
        .catch((err) => {
          this.logger.warn(`Session revocation Redis connection failed: ${err?.message ?? err}`);
        });
    } catch (err) {
      this.logger.warn(`Could not initialise session revocation Redis client: ${err}`);
    }
  }

  /** Subscribe to the Redis channel and relay remote revocations locally. */
  private async subscribeToChannel(): Promise<void> {
    if (!this.pub) return;
    try {
      const sub = this.pub.duplicate({ lazyConnect: true });
      await sub.connect();
      await sub.subscribe(SESSION_REVOKED_CHANNEL);
      sub.on('message', (_channel: string, message: string) => {
        try {
          const ids = JSON.parse(message);
          if (Array.isArray(ids)) {
            this.notifyLocal(ids.filter((id): id is string => typeof id === 'string'));
          }
        } catch {
          // Ignore malformed payloads
        }
      });
      this.sub = sub;
      this.connected = true;
    } catch (err: any) {
      this.logger.warn(`Failed to subscribe to session revocation channel: ${err?.message ?? err}`);
    }
  }

  /**
   * Register a listener for revocations. Returns an unsubscribe function.
   * Safe to call when Redis is unavailable – the local fan-out still works.
   */
  subscribe(handler: RevocationHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  /** Publish a revocation for the given session IDs. */
  async publishRevoked(sessionIds: string[]): Promise<void> {
    const unique = [...new Set(sessionIds.filter((id): id is string => Boolean(id)))];
    if (unique.length === 0) return;

    // Fan out synchronously so same-replica sockets are dropped immediately,
    // even if Redis is down.
    this.notifyLocal(unique);

    if (this.pub && this.connected) {
      try {
        await this.pub.publish(SESSION_REVOKED_CHANNEL, JSON.stringify(unique));
      } catch (err: any) {
        this.logger.warn(`Failed to publish session revocation: ${err?.message ?? err}`);
      }
    }
  }

  private notifyLocal(sessionIds: string[]): void {
    for (const handler of this.handlers) {
      try {
        handler(sessionIds);
      } catch (err: any) {
        this.logger.warn(`Session revocation handler failed: ${err?.message ?? err}`);
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      if (this.sub) {
        await this.sub.quit();
      }
      if (this.pub) {
        await this.pub.quit();
      }
    } catch {
      this.sub?.disconnect();
      this.pub?.disconnect();
    }
  }
}
