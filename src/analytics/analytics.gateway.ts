import { Logger, OnModuleDestroy, Injectable } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { getRedisConfig } from '../cache/cache.config';
import { AuthService } from '../auth/auth.service';
import { UserRole } from '@prisma/client';
import { AuthUserPayload } from '../auth/types/auth-user.type';
import { DashboardMetricsService, DashboardSnapshot } from './dashboard-metrics.service';

/**
 * Realtime dashboard metrics feed (issue #1297).
 *
 * Pushes low-frequency aggregate snapshots (queue depth, fraud alerts,
 * property/transaction deltas) to authenticated admins/agents over the
 * `analytics` Socket.IO namespace. Snapshots are cached by
 * {@link DashboardMetricsService} so a fleet of subscribers places no extra
 * load on the database, and the Socket.IO Redis adapter fans each emission out
 * to every replica.
 *
 * Event contract:
 *  - `analytics:snapshot`  – {@link DashboardSnapshot}, emitted immediately on
 *    connect and then every {@link SNAPSHOT_INTERVAL_MS}.
 *  - `analytics:heartbeat` – `{ timestamp }`, emitted every
 *    {@link HEARTBEAT_INTERVAL_MS} so clients can detect a stalled feed.
 */
const ANALYTICS_ROOM = 'analytics:global';
const SNAPSHOT_INTERVAL_MS = 5_000;
const HEARTBEAT_INTERVAL_MS = 10_000;
const ALLOWED_ROLES: UserRole[] = [UserRole.ADMIN, UserRole.AGENT];

const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((origin) => origin.trim())
  : ['http://localhost:3000'];

@Injectable()
@WebSocketGateway({
  cors: {
    origin: corsOrigins,
    credentials: true,
  },
  namespace: 'analytics',
})
export class AnalyticsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(AnalyticsGateway.name);
  private snapshotTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly metrics: DashboardMetricsService,
    private readonly authService: AuthService,
  ) {}

  afterInit(server: Server): void {
    this.setupRedisAdapter(server);
    this.startFeed();
    this.logger.log('AnalyticsGateway initialised');
  }

  onModuleDestroy(): void {
    if (this.snapshotTimer) {
      clearInterval(this.snapshotTimer);
      this.snapshotTimer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Attach the Socket.IO Redis adapter so a single emission reaches sockets
   * connected to any replica, mirroring the notifications gateway strategy.
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
          this.logger.log('Analytics Redis adapter attached — cross-replica push enabled');
        })
        .catch((err) => {
          this.logger.warn(
            `Analytics Redis adapter setup failed — single-instance mode: ${err.message}`,
          );
        });
    } catch (err) {
      this.logger.warn(`Could not create analytics Redis adapter: ${err}`);
    }
  }

  private startFeed(): void {
    this.snapshotTimer = setInterval(() => {
      void this.emitSnapshot();
    }, SNAPSHOT_INTERVAL_MS);
    this.snapshotTimer.unref?.();

    this.heartbeatTimer = setInterval(() => {
      this.server.to(ANALYTICS_ROOM).emit('analytics:heartbeat', { timestamp: Date.now() });
    }, HEARTBEAT_INTERVAL_MS);
    this.heartbeatTimer.unref?.();
  }

  private async emitSnapshot(): Promise<void> {
    try {
      const snapshot = await this.metrics.getSnapshot();
      this.server.to(ANALYTICS_ROOM).emit('analytics:snapshot', snapshot);
    } catch (error) {
      this.logger.warn(
        `Failed to emit analytics snapshot: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async handleConnection(client: Socket): Promise<void> {
    const token = this.extractToken(client);
    let user: AuthUserPayload;

    try {
      if (!token) {
        throw new Error('Missing token');
      }
      user = await this.authService.validateAccessToken(token);
    } catch {
      client.emit('analytics:error', { message: 'Unauthorized' });
      client.disconnect(true);
      return;
    }

    if (!ALLOWED_ROLES.includes(user.role)) {
      client.emit('analytics:error', { message: 'Forbidden' });
      client.disconnect(true);
      return;
    }

    client.data.userId = user.sub;
    client.data.role = user.role;
    client.join(ANALYTICS_ROOM);

    this.logger.log(`Analytics client ${user.sub} (${user.role}) connected ${client.id}`);

    // Push the current snapshot immediately so a new client is never blank.
    this.metrics
      .getSnapshot()
      .then((snapshot: DashboardSnapshot) => client.emit('analytics:snapshot', snapshot))
      .catch(() => undefined);
  }

  handleDisconnect(client: Socket): void {
    const userId = client.data?.userId;
    if (userId) {
      this.logger.log(`Analytics client ${userId} disconnected ${client.id}`);
    }
  }

  private extractToken(client: Socket): string | undefined {
    const fromAuth = client.handshake.auth?.token as string | undefined;
    if (fromAuth?.trim()) {
      return fromAuth.trim();
    }
    const fromQuery = client.handshake.query?.token;
    if (typeof fromQuery === 'string' && fromQuery.trim()) {
      return fromQuery.trim();
    }
    return undefined;
  }
}
