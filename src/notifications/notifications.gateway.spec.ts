import { NotificationsGateway } from './notifications.gateway';

describe('NotificationsGateway', () => {
  let gateway: NotificationsGateway;
  let mockToReturn: { emit: jest.Mock };
  let mockServer: { to: jest.Mock; emit: jest.Mock };

  beforeEach(() => {
    gateway = new NotificationsGateway();
    mockToReturn = { emit: jest.fn() };
    mockServer = {
      to: jest.fn().mockReturnValue(mockToReturn),
      emit: jest.fn(),
    };
    gateway.server = mockServer as any;
  });

  describe('handleConnection', () => {
    it('tracks a connecting user and joins their room', () => {
      const client = {
        id: 'socket-1',
        handshake: { query: { userId: 'user-1' } },
        join: jest.fn(),
      };
      gateway.handleConnection(client as any);
      expect(client.join).toHaveBeenCalledWith('user:user-1');
    });

    it('does nothing when no userId is present', () => {
      const client = {
        id: 'socket-2',
        handshake: { query: {} },
        join: jest.fn(),
      };
      expect(() => gateway.handleConnection(client as any)).not.toThrow();
      expect(client.join).not.toHaveBeenCalled();
    });
  });

  describe('handleDisconnect', () => {
    it('cleans up a previously tracked user', () => {
      const client = {
        id: 'socket-1',
        handshake: { query: { userId: 'user-1' } },
        join: jest.fn(),
      };
      gateway.handleConnection(client as any);
      expect(() => gateway.handleDisconnect(client as any)).not.toThrow();
    });

    it('does nothing for an untracked socket', () => {
      const client = { id: 'unknown-socket' };
      expect(() => gateway.handleDisconnect(client as any)).not.toThrow();
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
    it('emits to the target user room and returns true', () => {
      const result = gateway.sendToUser('user-1', 'custom:event', { foo: 'bar' });
      expect(mockServer.to).toHaveBeenCalledWith('user:user-1');
      expect(mockToReturn.emit).toHaveBeenCalledWith('custom:event', { foo: 'bar' });
      expect(result).toBe(true);
    });
  });

  describe('sendToAll', () => {
    it('broadcasts an event to all connected clients', () => {
      gateway.sendToAll('system:announcement', { message: 'hi' });
      expect(mockServer.emit).toHaveBeenCalledWith('system:announcement', { message: 'hi' });
    });
  });
});
