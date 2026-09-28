import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, Optional, OnModuleDestroy } from '@nestjs/common';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { RedisPresenceService } from './redis-presence.service';
import { WsTicketService } from './ws-ticket.service';
import { deviceFingerprint } from './device-fingerprint.util';
import { SessionRevocationService } from '../sessions/session-revocation.service';
import { SessionsService } from '../sessions/sessions.service';
import { getRedisConfig } from '../cache/cache.config';

/**
 * WebSocket gateway for real-time notifications.
 *
 * Cross-replica delivery is achieved through two complementary layers:
 *
 *  1. **Socket.IO Redis Adapter** – enables Socket.IO rooms to work across
 *     all replicas. When a socket joins `user:{id}` on pod A, pod B can also
 *     emit to that room. This is the primary delivery mechanism.
 *
 *  2. **RedisPresenceService** – a shared presence registry backed by Redis
 *     hashes with TTL-based expiry. It answers "is this user connected *anywhere*?"
 *     so we can accurately mark notifications as DELIVERED and avoid false negatives.
 *
 * Stale-entry cleanup: every entry has a 30 s TTL that is refreshed on a
 * heartbeat. If a pod crashes, entries expire automatically. A per-minute
 * cron sweep in RedisPresenceService handles any edge-case orphans.
 */
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((origin) => origin.trim())
  : ['http://localhost:3000'];

@WebSocketGateway({
  cors: {
    origin: corsOrigins,
    credentials: true,
  },
  namespace: 'notifications',
})
export class NotificationsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  @WebSocketServer()
  server: Server;

  private logger: Logger = new Logger('NotificationsGateway');

  /**
   * Local cache kept for fast lookups during hot paths. Always backed by
   * the Redis presence layer so replicas are authoritative.
   */
  private userSockets = new Map<string, Set<string>>();
  private socketUsers = new Map<string, string>();

  /** Maps a locally-connected socket to the session it is bound to (#1294). */
  private socketSessions = new Map<string, string>();

  /** Interval handle for heartbeat refreshes. */
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  /** Unsubscribe handle for session-revocation events. */
  private unsubscribeRevocation: (() => void) | null = null;

  constructor(
    private readonly presence: RedisPresenceService,
    @Optional() private readonly wsTicketService?: WsTicketService,
    @Optional() private readonly revocation?: SessionRevocationService,
    @Optional() private readonly sessions?: SessionsService,
  ) {}

  // ── Lifecycle ─────────────────────────────────────────────────────────

  afterInit(server: Server): void {
    this.setupRedisAdapter(server);
    this.startHeartbeat();
    this.unsubscribeRevocation =
      this.revocation?.subscribe((sessionIds) => {
        void this.handleSessionRevoked(sessionIds);
      }) ?? null;
    this.logger.log('NotificationsGateway initialised with Redis adapter');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.unsubscribeRevocation?.();
    this.unsubscribeRevocation = null;
  }

  /**
   * Attach the Socket.IO Redis adapter so rooms are shared across replicas.
   * Uses the same Redis instance configured for the application cache.
   */
  private setupRedisAdapter(server: Server): void {
    try {
      const config = getRedisConfig();
      const pubClient = new Redis({
        host: config.host,
        port: config.port,
        password: config.password,
        db: config.db,
        retryStrategy: config.retryStrategy as any,
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: true,
      });
      const subClient = pubClient.duplicate({ lazyConnect: true });

      Promise.all([pubClient.connect(), subClient.connect()])
        .then(() => {
          server.adapter(createAdapter(pubClient, subClient) as any);
          this.logger.log('Socket.IO Redis adapter attached — cross-replica rooms enabled');
        })
        .catch((err) => {
          this.logger.warn(
            `Redis adapter setup failed — falling back to single-instance mode: ${err.message}`,
          );
        });
    } catch (err) {
      this.logger.warn(
        `Could not create Redis adapter — falling back to single-instance mode: ${err}`,
      );
    }
  }

  /**
   * Refresh presence TTLs for all locally-connected sockets every 10 s.
   * The Redis presence TTL is 30 s so three consecutive misses are needed
   * before an entry is considered stale.
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(async () => {
      for (const [socketId, userId] of this.socketUsers) {
        try {
          await this.presence.heartbeat(userId, socketId);
        } catch {
          // Best-effort: a single failure should not crash the loop
        }
      }

      // Re-validate sessions so revoked/expired sessions are dropped even if
      // the revocation broadcast was missed (issue #1294).
      for (const [socketId, sessionId] of this.socketSessions) {
        if (!this.sessions) continue;
        try {
          const valid = await this.sessions.isSessionValid(sessionId);
          if (!valid) {
            this.disconnectSocket(socketId, sessionId);
          }
        } catch {
          // Best-effort: transient DB/Redis errors should not crash the loop
        }
      }
    }, 10_000);
  }

  // ── Connection lifecycle ──────────────────────────────────────────────

  async handleConnection(client: Socket): Promise<void> {
    const identity = await this.authenticateClient(client);

    if (!identity) {
      this.logger.warn(`Connection rejected: authentication failed`);
      client.disconnect(true);
      return;
    }

    const { userId, sessionId } = identity;

    // Local tracking (fast-path cache)
    const sockets = this.userSockets.get(userId) ?? new Set<string>();
    sockets.add(client.id);
    this.userSockets.set(userId, sockets);
    this.socketUsers.set(client.id, userId);
    if (sessionId) {
      this.socketSessions.set(client.id, sessionId);
    }

    // Socket.IO room (for local delivery via .to()), plus a session room so
    // revocations can target every socket bound to a session (issue #1294).
    client.join(`user:${userId}`);
    if (sessionId) {
      client.join(`session:${sessionId}`);
    }

    // Redis presence (for cross-replica queries)
    try {
      await this.presence.register(userId, client.id);
    } catch (err) {
      this.logger.warn(`Failed to register presence for ${userId}: ${err}`);
    }

    this.logger.log(`User ${userId} connected (${client.id})`);
  }

  /**
   * Resolve the identity for a handshake.
   *
   * Preferred: a short-lived `ws-ticket` (in `auth.ticket` or the `ticket`
   * query param) issued by `POST /notifications/ws-ticket`. The ticket is
   * bound to a session and device fingerprint and is validated against the
   * SessionsService so revoked sessions cannot connect.
   *
   * Legacy fallback: a raw `userId` query param. Kept for backward
   * compatibility; it is unauthenticated and logs a warning.
   */
  private async authenticateClient(
    client: Socket,
  ): Promise<{ userId: string; sessionId?: string } | null> {
    const handshake: any = client.handshake ?? {};
    const ticket = handshake.auth?.ticket ?? handshake.query?.ticket;

    if (ticket) {
      if (!this.wsTicketService) {
        this.logger.warn('WebSocket ticket presented but ticket validation is unavailable');
        return null;
      }

      try {
        const payload = this.wsTicketService.verify(String(ticket));
        const fingerprint = deviceFingerprint(handshake.headers?.['user-agent']);

        if (payload.dfp && payload.dfp !== fingerprint) {
          this.logger.warn(`WebSocket ticket device fingerprint mismatch for ${payload.sub}`);
          return null;
        }

        if (this.sessions && !(await this.sessions.isSessionValid(payload.sid))) {
          this.logger.warn(`WebSocket ticket session ${payload.sid} is no longer valid`);
          return null;
        }

        return { userId: payload.sub, sessionId: payload.sid };
      } catch (err) {
        this.logger.warn(
          `WebSocket ticket rejected: ${err instanceof Error ? err.message : String(err)}`,
        );
        return null;
      }
    }

    const userId = handshake.query?.userId as string | undefined;
    if (userId) {
      this.logger.warn(
        `Legacy WebSocket auth via userId query for ${userId} — migrate to ws-ticket handshake auth`,
      );
      return { userId };
    }

    return null;
  }

  async handleDisconnect(client: Socket): Promise<void> {
    const userId = this.socketUsers.get(client.id);
    this.socketSessions.delete(client.id);

    if (userId) {
      // Local cleanup
      const sockets = this.userSockets.get(userId);
      if (sockets) {
        sockets.delete(client.id);
        if (sockets.size === 0) {
          this.userSockets.delete(userId);
        }
      }
      this.socketUsers.delete(client.id);

      // Redis cleanup
      try {
        await this.presence.unregister(userId, client.id);
      } catch (err) {
        this.logger.warn(`Failed to unregister presence for ${userId}: ${err}`);
      }

      this.logger.log(`User ${userId} disconnected (${client.id})`);
    }
  }

  /**
   * Drop every socket bound to the given sessions and notify them.
   * Invoked when `SessionsService` revokes a session (issue #1294).
   */
  async handleSessionRevoked(sessionIds: string[]): Promise<void> {
    for (const sessionId of sessionIds) {
      if (!sessionId) continue;
      const room = `session:${sessionId}`;

      try {
        const namespace: any = (this.server as any)?.in?.(room);
        namespace?.emit?.('session:revoked', { sessionId });
        namespace?.disconnectSockets?.(true);
      } catch (err) {
        this.logger.warn(
          `Failed to drop sockets for session ${sessionId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      // Ensure locally-tracked sockets are cleaned up even when the Socket.IO
      // server mock/namespace does not cascade disconnects.
      for (const [socketId, trackedSessionId] of [...this.socketSessions]) {
        if (trackedSessionId === sessionId) {
          this.disconnectSocket(socketId, sessionId);
        }
      }
    }
  }

  /** Disconnect a single locally-tracked socket. */
  private disconnectSocket(socketId: string, sessionId?: string): void {
    try {
      const socket: any = (this.server as any)?.sockets?.sockets?.get?.(socketId);
      socket?.disconnect?.(true);
    } catch (err) {
      this.logger.warn(
        `Failed to disconnect socket ${socketId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (sessionId) {
      this.socketSessions.delete(socketId);
    }
  }

  // ── Emit helpers for property events ──────────────────────────────────

  emitPropertyCreated(propertyId: string, data: any): void {
    this.server.to(`property:${propertyId}`).emit('property:created', { propertyId, ...data });
    this.logger.log(`Emitted property:created for ${propertyId}`);
  }

  emitPropertyUpdated(propertyId: string, data: any): void {
    this.server.to(`property:${propertyId}`).emit('property:updated', { propertyId, ...data });
    this.logger.log(`Emitted property:updated for ${propertyId}`);
  }

  emitPropertyPriceChanged(propertyId: string, data: any): void {
    this.server
      .to(`property:${propertyId}`)
      .emit('property:price_changed', { propertyId, ...data });
    this.logger.log(`Emitted property:price_changed for ${propertyId}`);
  }

  // ── Emit helpers for transaction events ───────────────────────────────

  emitTransactionCreated(transactionId: string, data: any): void {
    this.server
      .to(`transaction:${transactionId}`)
      .emit('transaction:created', { transactionId, ...data });
    this.logger.log(`Emitted transaction:created for ${transactionId}`);
  }

  emitTransactionStatusChanged(transactionId: string, data: any): void {
    this.server
      .to(`transaction:${transactionId}`)
      .emit('transaction:status_changed', { transactionId, ...data });
    this.logger.log(`Emitted transaction:status_changed for ${transactionId}`);
  }

  // ── Emit helpers for document events ──────────────────────────────────

  emitDocumentUploaded(data: any): void {
    this.server.emit('document:uploaded', data);
    this.logger.log(`Emitted document:uploaded`);
  }

  emitDocumentSigned(data: any): void {
    this.server.emit('document:signed', data);
    this.logger.log(`Emitted document:signed`);
  }

  emitDocumentExpired(data: any): void {
    this.server.emit('document:expired', data);
    this.logger.log(`Emitted document:expired`);
  }

  // ── Emit helpers for fraud events ─────────────────────────────────────

  emitFraudAlert(userId: string, data: any): void {
    this.sendToUser(userId, 'fraud:alert', data);
  }

  // ── Generic user-targeted send ────────────────────────────────────────

  /**
   * Send an event to a specific user. With the Redis adapter, this emit
   * reaches all replicas' local servers, so any socket that joined the
   * `user:{userId}` room will receive the message.
   *
   * Returns true if the user was detected as connected via the presence
   * layer (meaning at least one replica acknowledged a socket). Returns
   * false if the user is not known to be connected anywhere — callers
   * should fall back to persistent delivery (e.g. DB PENDING status).
   */
  async sendToUser(userId: string, event: string, data: any): Promise<boolean> {
    // Emit via Socket.IO rooms (cross-replica via Redis adapter)
    this.server.to(`user:${userId}`).emit(event, data);

    // Check Redis presence for accurate delivery status
    try {
      const connected = await this.presence.isUserConnected(userId);
      return connected;
    } catch {
      // If Redis is down, fall back to local check
      const localSockets = this.userSockets.get(userId);
      return !!localSockets && localSockets.size > 0;
    }
  }

  sendToAll(event: string, data: any): void {
    this.server.emit(event, data);
  }
}
