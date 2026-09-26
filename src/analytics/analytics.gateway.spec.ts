import { AnalyticsGateway } from './analytics.gateway';
import { DashboardMetricsService } from './dashboard-metrics.service';
import { AuthService } from '../auth/auth.service';

const snapshot = {
  generatedAt: new Date().toISOString(),
  queue: null,
  fraud: null,
  properties: null,
  transactions: null,
};

function makeSocket(token?: string) {
  return {
    id: 'socket-1',
    data: {} as Record<string, unknown>,
    handshake: {
      auth: token ? { token } : {},
      query: {},
    },
    emit: jest.fn(),
    join: jest.fn(),
    disconnect: jest.fn(),
  } as any;
}

describe('AnalyticsGateway (#1297)', () => {
  let gateway: AnalyticsGateway;
  let server: any;

  const metrics = {
    getSnapshot: jest.fn().mockResolvedValue(snapshot),
  };

  const authService = {
    validateAccessToken: jest.fn(),
  };

  const flush = () => new Promise((resolve) => setImmediate(resolve));

  beforeEach(() => {
    jest.clearAllMocks();
    server = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    };
    gateway = new AnalyticsGateway(
      metrics as unknown as DashboardMetricsService,
      authService as unknown as AuthService,
    );
    gateway.server = server;
  });

  it('rejects a connection without a token', async () => {
    const socket = makeSocket();
    await gateway.handleConnection(socket);

    expect(socket.emit).toHaveBeenCalledWith('analytics:error', { message: 'Unauthorized' });
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(authService.validateAccessToken).not.toHaveBeenCalled();
  });

  it('rejects an invalid token', async () => {
    authService.validateAccessToken.mockRejectedValue(new Error('bad token'));
    const socket = makeSocket('bad');

    await gateway.handleConnection(socket);

    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(socket.join).not.toHaveBeenCalled();
  });

  it('rejects non-admin/non-agent roles', async () => {
    authService.validateAccessToken.mockResolvedValue({
      sub: 'user-1',
      role: 'USER',
      type: 'access',
    });
    const socket = makeSocket('token');

    await gateway.handleConnection(socket);

    expect(socket.emit).toHaveBeenCalledWith('analytics:error', { message: 'Forbidden' });
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('admits an admin and pushes an initial snapshot', async () => {
    authService.validateAccessToken.mockResolvedValue({
      sub: 'admin-1',
      role: 'ADMIN',
      type: 'access',
    });
    const socket = makeSocket('token');

    await gateway.handleConnection(socket);
    await flush();

    expect(socket.join).toHaveBeenCalledWith('analytics:global');
    expect(socket.data.userId).toBe('admin-1');
    expect(socket.emit).toHaveBeenCalledWith('analytics:snapshot', snapshot);
  });

  it('emits snapshots to the analytics room', async () => {
    await (gateway as any).emitSnapshot();

    expect(server.to).toHaveBeenCalledWith('analytics:global');
    expect(server.emit).toHaveBeenCalledWith('analytics:snapshot', snapshot);
  });

  it('does not throw when the snapshot source fails', async () => {
    metrics.getSnapshot.mockRejectedValueOnce(new Error('cache down'));

    await expect((gateway as any).emitSnapshot()).resolves.toBeUndefined();
  });

  it('handleDisconnect tolerates unknown sockets', () => {
    expect(() => gateway.handleDisconnect(makeSocket())).not.toThrow();
  });
});
