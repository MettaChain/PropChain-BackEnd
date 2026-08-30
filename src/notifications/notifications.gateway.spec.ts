import { NotificationsGateway } from './notifications.gateway';
import { RedisPresenceService } from './redis-presence.service';

describe('NotificationsGateway', () => {
  let gateway: NotificationsGateway;
  let mockPresence: jest.Mocked<RedisPresenceService>;
  let mockToReturn: { emit: jest.Mock };
  let mockServer: { to: jest.Mock; emit: jest.Mock };

  beforeEach(() => {
    mockPresence = {
      register: jest.fn().mockResolvedValue(undefined),
      unregister: jest.fn().mockResolvedValue(undefined),
      heartbeat: jest.fn().mockResolvedValue(undefined),
      isUserConnected: jest.fn().mockResolvedValue(true),
      getUserSocketIds: jest.fn().mockResolvedValue([]),
      getUserIdBySocket: jest.fn().mockResolvedValue(null),
      getLocalSocketCount: jest.fn().mockResolvedValue(0),
      cleanupStaleEntries: jest.fn().mockResolvedValue(undefined),
    } as any;

    gateway = new NotificationsGateway(mockPresence);

    mockToReturn = { emit: jest.fn() };
    mockServer = {
      to: jest.fn().mockReturnValue(mockToReturn),
      emit: jest.fn(),
    };
    gateway.server = mockServer as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handleConnection', () => {
    it('tracks a connecting user, joins their room, and registers in Redis', async () => {
      const client = {
        id: 'socket-1',
        handshake: { query: { userId: 'user-1' } },
        join: jest.fn(),
      };
      await gateway.handleConnection(client as any);
      expect(client.join).toHaveBeenCalledWith('user:user-1');
      expect(mockPresence.register).toHaveBeenCalledWith('user-1', 'socket-1');
    });

    it('rejects connection when no userId is present', async () => {
      const client = {
        id: 'socket-2',
        handshake: { query: {} },
        join: jest.fn(),
        disconnect: jest.fn(),
      };
      await gateway.handleConnection(client as any);
      expect(client.join).not.toHaveBeenCalled();
      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(mockPresence.register).not.toHaveBeenCalled();
    });

    it('handles multiple sockets for the same user', async () => {
      const client1 = {
        id: 'socket-1',
        handshake: { query: { userId: 'user-1' } },
        join: jest.fn(),
      };
      const client2 = {
        id: 'socket-2',
        handshake: { query: { userId: 'user-1' } },
        join: jest.fn(),
      };

      await gateway.handleConnection(client1 as any);
      await gateway.handleConnection(client2 as any);

      expect(mockPresence.register).toHaveBeenCalledTimes(2);
      expect(mockPresence.register).toHaveBeenCalledWith('user-1', 'socket-1');
      expect(mockPresence.register).toHaveBeenCalledWith('user-1', 'socket-2');
    });
  });

  describe('handleDisconnect', () => {
    it('cleans up local tracking and unregisters from Redis', async () => {
      const client = {
        id: 'socket-1',
        handshake: { query: { userId: 'user-1' } },
        join: jest.fn(),
      };

      await gateway.handleConnection(client as any);
      await gateway.handleDisconnect(client as any);

      expect(mockPresence.unregister).toHaveBeenCalledWith('user-1', 'socket-1');
    });

    it('does nothing for an untracked socket', async () => {
      const client = { id: 'unknown-socket' } as any;
      await gateway.handleDisconnect(client);
      expect(mockPresence.unregister).not.toHaveBeenCalled();
    });

    it('keeps user in local maps when one of multiple sockets disconnects', async () => {
      const client1 = {
        id: 'socket-1',
        handshake: { query: { userId: 'user-1' } },
        join: jest.fn(),
      };
      const client2 = {
        id: 'socket-2',
        handshake: { query: { userId: 'user-1' } },
        join: jest.fn(),
      };

      await gateway.handleConnection(client1 as any);
      await gateway.handleConnection(client2 as any);
      await gateway.handleDisconnect(client1 as any);

      // User still has socket-2 registered
      expect(mockPresence.unregister).toHaveBeenCalledWith('user-1', 'socket-1');
      // But not fully removed — the second socket is still present
    });

    it('removes user from local maps when last socket disconnects', async () => {
      const client = {
        id: 'socket-1',
        handshake: { query: { userId: 'user-1' } },
        join: jest.fn(),
      };

      await gateway.handleConnection(client as any);
      await gateway.handleDisconnect(client as any);

      // Internal maps should be cleaned up (no leak)
      expect(mockPresence.unregister).toHaveBeenCalledWith('user-1', 'socket-1');
    });
  });

  describe('emit helpers', () => {
    it('emitPropertyCreated emits to the property room', () => {
      gateway.emitPropertyCreated('prop-1', { title: 'New listing' });
      expect(mockServer.to).toHaveBeenCalledWith('property:prop-1');
      expect(mockToReturn.emit).toHaveBeenCalledWith('property:created', {
        propertyId: 'prop-1',
        title: 'New listing',
      });
    });

    it('emitPropertyUpdated emits to the property room', () => {
      gateway.emitPropertyUpdated('prop-1', { title: 'Updated' });
      expect(mockToReturn.emit).toHaveBeenCalledWith('property:updated', {
        propertyId: 'prop-1',
        title: 'Updated',
      });
    });

    it('emitPropertyPriceChanged emits to the property room', () => {
      gateway.emitPropertyPriceChanged('prop-1', { price: 500000 });
      expect(mockToReturn.emit).toHaveBeenCalledWith('property:price_changed', {
        propertyId: 'prop-1',
        price: 500000,
      });
    });

    it('emitTransactionCreated emits to the transaction room', () => {
      gateway.emitTransactionCreated('tx-1', { amount: 1000 });
      expect(mockServer.to).toHaveBeenCalledWith('transaction:tx-1');
      expect(mockToReturn.emit).toHaveBeenCalledWith('transaction:created', {
        transactionId: 'tx-1',
        amount: 1000,
      });
    });

    it('emitTransactionStatusChanged emits to the transaction room', () => {
      gateway.emitTransactionStatusChanged('tx-1', { status: 'COMPLETED' });
      expect(mockToReturn.emit).toHaveBeenCalledWith('transaction:status_changed', {
        transactionId: 'tx-1',
        status: 'COMPLETED',
      });
    });

    it('emitDocumentUploaded broadcasts to all', () => {
      gateway.emitDocumentUploaded({ docId: 'doc-1' });
      expect(mockServer.emit).toHaveBeenCalledWith('document:uploaded', { docId: 'doc-1' });
    });

    it('emitDocumentSigned broadcasts to all', () => {
      gateway.emitDocumentSigned({ docId: 'doc-1' });
      expect(mockServer.emit).toHaveBeenCalledWith('document:signed', { docId: 'doc-1' });
    });

    it('emitDocumentExpired broadcasts to all', () => {
      gateway.emitDocumentExpired({ docId: 'doc-1' });
      expect(mockServer.emit).toHaveBeenCalledWith('document:expired', { docId: 'doc-1' });
    });

    it('emitFraudAlert sends to the target user room', () => {
      gateway.emitFraudAlert('user-1', { reason: 'suspicious login' });
      expect(mockServer.to).toHaveBeenCalledWith('user:user-1');
      expect(mockToReturn.emit).toHaveBeenCalledWith('fraud:alert', {
        reason: 'suspicious login',
      });
    });
  });

  describe('sendToUser', () => {
    it('emits to the target user room and returns true when user is connected', async () => {
      mockPresence.isUserConnected.mockResolvedValue(true);
      const result = await gateway.sendToUser('user-1', 'custom:event', { foo: 'bar' });
      expect(mockServer.to).toHaveBeenCalledWith('user:user-1');
      expect(mockToReturn.emit).toHaveBeenCalledWith('custom:event', { foo: 'bar' });
      expect(result).toBe(true);
    });

    it('returns false when user is not connected on any replica', async () => {
      mockPresence.isUserConnected.mockResolvedValue(false);
      const result = await gateway.sendToUser('user-99', 'custom:event', { foo: 'bar' });
      expect(mockServer.to).toHaveBeenCalledWith('user:user-99');
      expect(result).toBe(false);
    });

    it('falls back to local check when Redis is unavailable', async () => {
      mockPresence.isUserConnected.mockRejectedValue(new Error('Redis down'));
      // Simulate a locally connected socket
      const client = {
        id: 'socket-1',
        handshake: { query: { userId: 'user-1' } },
        join: jest.fn(),
      };
      await gateway.handleConnection(client as any);

      const result = await gateway.sendToUser('user-1', 'custom:event', { foo: 'bar' });
      expect(result).toBe(true);
    });
  });

  describe('sendToAll', () => {
    it('broadcasts an event to all connected clients', () => {
      gateway.sendToAll('system:announcement', { message: 'hi' });
      expect(mockServer.emit).toHaveBeenCalledWith('system:announcement', { message: 'hi' });
    });
  });

  describe('cross-replica routing', () => {
    it('presence service is queried on sendToUser for delivery status', async () => {
      await gateway.sendToUser('user-1', 'notification', { title: 'Hello' });
      expect(mockPresence.isUserConnected).toHaveBeenCalledWith('user-1');
    });

    it('handles rapid connect/disconnect cycles without leaking state', async () => {
      const client = {
        id: 'socket-1',
        handshake: { query: { userId: 'user-1' } },
        join: jest.fn(),
      };

      // Connect → disconnect → connect → disconnect
      await gateway.handleConnection(client as any);
      await gateway.handleDisconnect(client as any);
      await gateway.handleConnection(client as any);
      await gateway.handleDisconnect(client as any);

      expect(mockPresence.register).toHaveBeenCalledTimes(2);
      expect(mockPresence.unregister).toHaveBeenCalledTimes(2);
    });
  });
});
