// @ts-nocheck

import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, Inject, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { AuthUserPayload } from '../auth/types/auth-user.type';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: 'notifications',
})
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger: Logger = new Logger('NotificationsGateway');
  private userSockets = new Map<string, string[]>();
  private socketUsers = new Map<string, string>();
  private eventRateLimits = new Map<string, { count: number; resetTime: number }>();
  private readonly MAX_CONNECTIONS_PER_USER = 5;
  private readonly MAX_EVENTS_PER_MINUTE = 60;
  private readonly RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute in milliseconds

  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  private extractTokenFromHandshake(client: Socket): string | null {
    // Try to get token from authorization header
    const authHeader = client.handshake.headers.authorization;
    if (authHeader) {
      const [scheme, token] = authHeader.split(' ');
      if (scheme === 'Bearer' && token) {
        return token;
      }
    }
    
    // Fallback to query parameter for websocket connections that can't send headers
    const tokenFromQuery = client.handshake.query.token as string;
    if (tokenFromQuery) {
      return tokenFromQuery;
    }
    
    return null;
  }

  async handleConnection(client: Socket) {
    try {
      // Extract and validate JWT token
      const token = this.extractTokenFromHandshake(client);
      if (!token) {
        this.logger.warn(`Connection rejected: Missing authentication token (client: ${client.id})`);
        client.disconnect(true);
        return;
      }

      let authUser: AuthUserPayload;
      try {
        authUser = await this.authService.validateAccessToken(token);
      } catch (error) {
        this.logger.warn(`Connection rejected: Invalid JWT token (client: ${client.id})`);
        client.disconnect(true);
        return;
      }

      const userId = authUser.sub;
      
      // Check max connections per user
      const currentConnections = this.userSockets.get(userId) || [];
      if (currentConnections.length >= this.MAX_CONNECTIONS_PER_USER) {
        this.logger.warn(`Connection rejected: User ${userId} exceeded max connections (${this.MAX_CONNECTIONS_PER_USER})`);
        client.disconnect(true);
        return;
      }

      // Add the new connection
      currentConnections.push(client.id);
      this.userSockets.set(userId, currentConnections);
      this.socketUsers.set(client.id, userId);

      // Join the user's private room
      client.join(`user:${userId}`);

      this.logger.log(`User ${userId} connected (${client.id}). Active connections: ${currentConnections.length}/${this.MAX_CONNECTIONS_PER_USER}`);
    } catch (error) {
      this.logger.error(`Error during connection handling: ${error.message}`, error.stack);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const userId = this.socketUsers.get(client.id);
    if (userId) {
      const sockets = this.userSockets.get(userId) || [];
      const index = sockets.indexOf(client.id);
      if (index > -1) {
        sockets.splice(index, 1);
      }
      if (sockets.length === 0) {
        this.userSockets.delete(userId);
      }
      this.socketUsers.delete(client.id);
      // Clean up rate limit entry for this socket
      this.eventRateLimits.delete(client.id);
      this.logger.log(`User ${userId} disconnected (${client.id}). Remaining connections: ${sockets.length}`);
    }
  }

  private checkRateLimit(clientId: string): boolean {
    const now = Date.now();
    const rateLimit = this.eventRateLimits.get(clientId);
    
    if (!rateLimit) {
      // First event, initialize rate limit
      this.eventRateLimits.set(clientId, { count: 1, resetTime: now + this.RATE_LIMIT_WINDOW });
      return true;
    }

    // Reset counter if window has expired
    if (now > rateLimit.resetTime) {
      rateLimit.count = 1;
      rateLimit.resetTime = now + this.RATE_LIMIT_WINDOW;
      return true;
    }

    // Check if limit exceeded
    if (rateLimit.count >= this.MAX_EVENTS_PER_MINUTE) {
      this.logger.warn(`Rate limit exceeded for client ${clientId}`);
      return false;
    }

    // Increment counter
    rateLimit.count++;
    return true;
  }

  @SubscribeMessage('joinProperty')
  handleJoinProperty(@ConnectedSocket() client: Socket, @MessageBody() data: { propertyId: string }) {
    // Check rate limit
    if (!this.checkRateLimit(client.id)) {
      return { event: 'error', data: { message: 'Rate limit exceeded. Please try again later.' } };
    }

    if (data?.propertyId) {
      client.join(`property:${data.propertyId}`);
      this.logger.log(`Client ${client.id} joined property room ${data.propertyId}`);
      return { event: 'joinedProperty', data: { propertyId: data.propertyId } };
    }
    return { event: 'error', data: { message: 'propertyId is required' } };
  }

  @SubscribeMessage('leaveProperty')
  handleLeaveProperty(@ConnectedSocket() client: Socket, @MessageBody() data: { propertyId: string }) {
    // Check rate limit
    if (!this.checkRateLimit(client.id)) {
      return { event: 'error', data: { message: 'Rate limit exceeded. Please try again later.' } };
    }

    if (data?.propertyId) {
      client.leave(`property:${data.propertyId}`);
      this.logger.log(`Client ${client.id} left property room ${data.propertyId}`);
      return { event: 'leftProperty', data: { propertyId: data.propertyId } };
    }
    return { event: 'error', data: { message: 'propertyId is required' } };
  }

  @SubscribeMessage('joinTransaction')
  handleJoinTransaction(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { transactionId: string },
  ) {
    // Check rate limit
    if (!this.checkRateLimit(client.id)) {
      return { event: 'error', data: { message: 'Rate limit exceeded. Please try again later.' } };
    }

    if (data?.transactionId) {
      client.join(`transaction:${data.transactionId}`);
      this.logger.log(`Client ${client.id} joined transaction room ${data.transactionId}`);
      return { event: 'joinedTransaction', data: { transactionId: data.transactionId } };
    }
    return { event: 'error', data: { message: 'transactionId is required' } };
  }

  @SubscribeMessage('leaveTransaction')
  handleLeaveTransaction(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { transactionId: string },
  ) {
    // Check rate limit
    if (!this.checkRateLimit(client.id)) {
      return { event: 'error', data: { message: 'Rate limit exceeded. Please try again later.' } };
    }

    if (data?.transactionId) {
      client.leave(`transaction:${data.transactionId}`);
      return { event: 'leftTransaction', data: { transactionId: data.transactionId } };
    }
    return { event: 'error', data: { message: 'transactionId is required' } };
  }

  @SubscribeMessage('joinUser')
  handleJoinUser(@ConnectedSocket() client: Socket, @MessageBody() data: { userId: string }) {
    // Check rate limit
    if (!this.checkRateLimit(client.id)) {
      return { event: 'error', data: { message: 'Rate limit exceeded. Please try again later.' } };
    }

    const socketUserId = this.socketUsers.get(client.id);
    if (socketUserId && socketUserId === data?.userId) {
      client.join(`user:${data.userId}`);
      return { event: 'joinedUser', data: { userId: data.userId } };
    }
    return { event: 'error', data: { message: 'Unauthorized to join this user room' } };
  }

  // -- Emit helpers for property events --

  emitPropertyCreated(propertyId: string, data: any) {
    this.server.to(`property:${propertyId}`).emit('property:created', { propertyId, ...data });
    this.logger.log(`Emitted property:created for ${propertyId}`);
  }

  emitPropertyUpdated(propertyId: string, data: any) {
    this.server.to(`property:${propertyId}`).emit('property:updated', { propertyId, ...data });
    this.logger.log(`Emitted property:updated for ${propertyId}`);
  }

  emitPropertyPriceChanged(propertyId: string, data: any) {
    this.server.to(`property:${propertyId}`).emit('property:price_changed', { propertyId, ...data });
    this.logger.log(`Emitted property:price_changed for ${propertyId}`);
  }

  // -- Emit helpers for transaction events --

  emitTransactionCreated(transactionId: string, data: any) {
    this.server
      .to(`transaction:${transactionId}`)
      .emit('transaction:created', { transactionId, ...data });
    this.logger.log(`Emitted transaction:created for ${transactionId}`);
  }

  emitTransactionStatusChanged(transactionId: string, data: any) {
    this.server
      .to(`transaction:${transactionId}`)
      .emit('transaction:status_changed', { transactionId, ...data });
    this.logger.log(`Emitted transaction:status_changed for ${transactionId}`);
  }

  // -- Emit helpers for document events --

  emitDocumentUploaded(data: any) {
    this.server.emit('document:uploaded', data);
    this.logger.log(`Emitted document:uploaded`);
  }

  emitDocumentSigned(data: any) {
    this.server.emit('document:signed', data);
    this.logger.log(`Emitted document:signed`);
  }

  emitDocumentExpired(data: any) {
    this.server.emit('document:expired', data);
    this.logger.log(`Emitted document:expired`);
  }

  // -- Emit helpers for fraud events --

  emitFraudAlert(userId: string, data: any) {
    this.sendToUser(userId, 'fraud:alert', data);
  }

  // -- Generic user-targeted send --

  sendToUser(userId: string, event: string, data: any): boolean {
    this.server.to(`user:${userId}`).emit(event, data);
    return true;
  }

  sendToAll(event: string, data: any) {
    this.server.emit(event, data);
  }
}