import type { Response } from 'express';
import { AppLogger } from '../../../src/common/logger';
import { requestIdStorage } from '../../../src/common/request-id.middleware';
import {
  ApiKeyHeaderMiddleware,
  ClientInfoMiddleware,
  type ContextRequest,
  RateLimitKeyMiddleware,
  RequestBodyAuditMiddleware,
} from './request-context.middleware';

const response = {} as Response;
const request = (properties: Partial<ContextRequest>) =>
  ({
    headers: {},
    socket: { remoteAddress: '192.0.2.1' },
    app: { get: () => () => false },
    ...properties,
  }) as ContextRequest;

afterEach(() => jest.restoreAllMocks());

it('resolves configured API key precedence and logs only a hash', () => {
  const debug = jest.spyOn(AppLogger.prototype, 'debug').mockImplementation(() => {});
  const middleware = new ApiKeyHeaderMiddleware({ apiKeyHeaders: ['authorization', 'x-api-key'] });
  const req = request({ headers: { 'x-api-key': 'first-key', authorization: 'ApiKey other-key' } });
  const next = jest.fn();
  middleware.use(req, response, next);
  expect(req.apiKey).toBe('other-key');
  expect(debug.mock.calls[0][1]).toMatchObject({
    keyHash: expect.stringMatching(/^[a-f0-9]{64}$/),
  });
  expect(JSON.stringify(debug.mock.calls)).not.toContain('other-key');
  expect(next).toHaveBeenCalledTimes(1);
  const missing = request({ headers: { authorization: 'Bearer other-key' } });
  middleware.use(missing, response, next);
  expect(missing.apiKey).toBeUndefined();
});

it('extracts client information and ignores forwarding headers from untrusted peers', () => {
  const req = request({
    headers: { 'x-real-ip': '203.0.113.10', 'user-agent': 'ExampleCrawler/Linux' },
  });
  const middleware = new ClientInfoMiddleware();
  middleware.use(req, response, jest.fn());
  expect(req.clientInfo).toMatchObject({
    ip: '192.0.2.1',
    isBot: true,
    deviceType: 'bot',
    platform: 'Linux',
  });
  Object.assign(req.app, { get: () => () => true });
  middleware.use(req, response, jest.fn());
  expect(req.clientInfo?.ip).toBe('203.0.113.10');
});

it('uses authenticated identity before IP and namespaces by tenant', () => {
  const req = request({ tenantId: 'tenant-a', apiKey: 'unvalidated-key' });
  const middleware = new RateLimitKeyMiddleware();
  middleware.use(req, response, jest.fn());
  expect(JSON.parse(req.rateLimitKey!)).toEqual(['tenant-a', 'ip', '192.0.2.1']);
  req.authUser = { apiKeyId: 'api-user' };
  middleware.use(req, response, jest.fn());
  expect(JSON.parse(req.rateLimitKey!)).toEqual(['tenant-a', 'api-key', 'api-user']);
  req.user = { id: 'user-a' };
  middleware.use(req, response, jest.fn());
  expect(JSON.parse(req.rateLimitKey!)).toEqual(['tenant-a', 'user', 'user-a']);
});

it('redacts nested audit fields, correlates requests and skips disabled or oversized bodies', () => {
  const log = jest.spyOn(AppLogger.prototype, 'warn').mockImplementation(() => {});
  const middleware = new RequestBodyAuditMiddleware({
    audit: {
      enabled: (req) => req.path === '/audit',
      redactFields: ['medical-id'],
      maxBytes: 128,
      level: 'warn',
    },
  });
  const req = {
    method: 'PATCH',
    path: '/audit',
    is: () => 'application/json',
    body: {
      nested: [{ Credit_Card: 'card', 'medical-id': 'medical', visible: 'yes' }],
    },
  };
  const next = jest.fn();
  requestIdStorage.run(new Map([['requestId', 'request-a']]), () =>
    middleware.use(request(req as Partial<ContextRequest>), response, next),
  );
  expect(log).toHaveBeenCalledWith('Request body audit', {
    method: 'PATCH',
    correlationId: 'request-a',
    body: { nested: [{ Credit_Card: '[REDACTED]', 'medical-id': '[REDACTED]', visible: 'yes' }] },
  });
  middleware.use(request({ ...req, path: '/skip' } as Partial<ContextRequest>), response, next);
  expect(log).toHaveBeenCalledTimes(1);
  middleware.use(
    request({ ...req, headers: { 'content-length': '1000' } } as Partial<ContextRequest>),
    response,
    next,
  );
  expect(log).toHaveBeenLastCalledWith(
    'Request body audit size limit exceeded',
    expect.any(Object),
  );
  expect(next).toHaveBeenCalledTimes(3);
});
