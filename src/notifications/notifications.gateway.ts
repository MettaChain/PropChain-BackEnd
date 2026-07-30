// @ts-nocheck

import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

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

  handleConnection(client: Socket) {
    const userId = client.handshake.query.userId as string;
    if (userId) {
      const sockets = this.userSockets.get(userId) || [];
      sockets.push(client.id);
      this.userSockets.set(userId, sockets);
      this.socketUsers.set(client.id, userId);

      client.join(`user:${userId}`);

      this.logger.log(`User ${userId} connected (${client.id})`);
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
      this.logger.log(`User ${userId} disconnected (${client.id})`);
    }
  }

  sendToUser(userId: string, event: string, data: unknown): boolean {
    const sockets = this.userSockets.get(userId);
    if (sockets && sockets.length > 0) {
      sockets.forEach((socketId) => {
        this.server.to(socketId).emit(event, data);
      });
      return true;
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
    this.server
      .to(`property:${propertyId}`)
      .emit('property:price_changed', { propertyId, ...data });
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
