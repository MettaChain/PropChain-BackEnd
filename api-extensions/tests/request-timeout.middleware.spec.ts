import { RequestTimeoutException } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import {
  DEFAULT_REQUEST_TIMEOUT_MS,
  REQUEST_TIMEOUT_OPTIONS,
  RequestTimeoutMiddleware,
  parseTimeoutHeader,
} from '../modules/request-timeout/request-timeout.middleware';

interface MutableResponse {
  headersSent: boolean;
  writableEnded: boolean;
  destroy: jest.Mock;
  once: (event: string, handler: () => void) => MutableResponse;
  removeListener: (event: string, handler: () => void) => MutableResponse;
}

interface ResponseStub {
  response: Response;
  handlers: Record<string, () => void>;
  destroy: jest.Mock;
}

function responseStub(): ResponseStub {
  const handlers: Record<string, () => void> = {};
  const destroy = jest.fn();
  const response: MutableResponse = {
    headersSent: false,
    writableEnded: false,
    destroy,
    once: jest.fn((event: string, handler: () => void) => {
      handlers[event] = handler;
      return response;
    }),
    removeListener: jest.fn(() => response),
  };
  return { response: response as unknown as Response, handlers, destroy };
}

function requestWith(overrides: Record<string, unknown> = {}): Request {
  return {
    headers: {},
    method: 'GET',
    originalUrl: '/api/extensions/test',
    ip: '203.0.113.10',
    ...overrides,
  } as unknown as Request;
}

function run(
  middleware: RequestTimeoutMiddleware,
  request: Request,
  response: Response,
): jest.Mock {
  const next = jest.fn();
  middleware.use(request, response, next as unknown as NextFunction);
  return next;
}

describe('RequestTimeoutMiddleware (#1603)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('exposes its options token', () => {
    expect(REQUEST_TIMEOUT_OPTIONS).toBeDefined();
  });

  it('defaults to 30 seconds and raises a 408 after the timeout', () => {
    const middleware = new RequestTimeoutMiddleware();
    const request = requestWith();
    const { response } = responseStub();
    const next = run(middleware, request, response);

    expect(next).toHaveBeenCalledTimes(1);
    expect((request as Request & { timeoutMs?: number }).timeoutMs).toBe(
      DEFAULT_REQUEST_TIMEOUT_MS,
    );

    jest.advanceTimersByTime(DEFAULT_REQUEST_TIMEOUT_MS - 1);
    expect(next).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(1);
    expect(next).toHaveBeenCalledTimes(2);
    const error = next.mock.calls[1][0];
    expect(error).toBeInstanceOf(RequestTimeoutException);
    expect((error as RequestTimeoutException).getStatus()).toBe(408);
    expect((request as Request & { timedOut?: boolean }).timedOut).toBe(true);
  });

  it('clears the timer when the response finishes normally', () => {
    const middleware = new RequestTimeoutMiddleware();
    const request = requestWith();
    const stub = responseStub();
    const next = run(middleware, request, stub.response);

    stub.handlers.finish?.();
    jest.advanceTimersByTime(DEFAULT_REQUEST_TIMEOUT_MS + 1);

    expect(next).toHaveBeenCalledTimes(1);
    expect(stub.destroy).not.toHaveBeenCalled();
  });

  it('destroys the socket when the response has already started', () => {
    const middleware = new RequestTimeoutMiddleware({ defaultTimeoutMs: 1_000 });
    const request = requestWith();
    const stub = responseStub();
    (stub.response as unknown as { headersSent: boolean }).headersSent = true;

    const next = run(middleware, request, stub.response);
    jest.advanceTimersByTime(1_000);

    expect(next).toHaveBeenCalledTimes(1);
    expect(stub.destroy).toHaveBeenCalledTimes(1);
  });

  it('honours a per-route X-Request-Timeout override in seconds', () => {
    const middleware = new RequestTimeoutMiddleware();
    const request = requestWith({ headers: { 'x-request-timeout': '2s' } });
    const { response } = responseStub();
    const next = run(middleware, request, response);

    expect((request as Request & { timeoutMs?: number }).timeoutMs).toBe(2_000);
    jest.advanceTimersByTime(1_999);
    expect(next).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('clamps overrides to the configured bounds', () => {
    const middleware = new RequestTimeoutMiddleware({
      defaultTimeoutMs: 5_000,
      minTimeoutMs: 250,
      maxTimeoutMs: 10_000,
    });

    const low = requestWith({ headers: { 'x-request-timeout': '1' } });
    run(middleware, low, responseStub().response);
    expect((low as Request & { timeoutMs?: number }).timeoutMs).toBe(250);

    const high = requestWith({ headers: { 'x-request-timeout': '600000' } });
    run(middleware, high, responseStub().response);
    expect((high as Request & { timeoutMs?: number }).timeoutMs).toBe(10_000);
  });

  it('ignores overrides when disabled', () => {
    const middleware = new RequestTimeoutMiddleware({
      defaultTimeoutMs: 7_000,
      allowClientOverride: false,
    });
    const request = requestWith({ headers: { 'x-request-timeout': '1s' } });

    run(middleware, request, responseStub().response);
    expect((request as Request & { timeoutMs?: number }).timeoutMs).toBe(7_000);
  });

  it('falls back to the default for malformed overrides', () => {
    const middleware = new RequestTimeoutMiddleware({ defaultTimeoutMs: 4_000 });
    const request = requestWith({ headers: { 'x-request-timeout': 'soon' } });

    run(middleware, request, responseStub().response);
    expect((request as Request & { timeoutMs?: number }).timeoutMs).toBe(4_000);
  });
});

describe('parseTimeoutHeader', () => {
  it.each([
    ['500', 500],
    ['500ms', 500],
    ['2s', 2_000],
    ['1.5s', 1_500],
    ['  750ms ', 750],
  ])('parses %p as %p ms', (input, expected) => {
    expect(parseTimeoutHeader(input)).toBe(expected);
  });

  it.each(['', 'abc', '-1', '10m', '1ss'])('rejects %p', (input) => {
    expect(parseTimeoutHeader(input)).toBeNull();
  });
});
