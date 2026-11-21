import { NextFunction, Request, Response } from 'express';
import {
  CORS_PREFLIGHT_OPTIONS,
  CorsPreflightMiddleware,
  DEFAULT_CORS_MAX_AGE_SECONDS,
} from '../modules/cors-preflight/cors-preflight.middleware';

interface StubResponse {
  statusCode?: number;
  headers: Map<string, string | string[]>;
  setHeader: jest.Mock;
  getHeader: jest.Mock;
  status: jest.Mock;
  end: jest.Mock;
}

function responseStub(initialHeaders: Record<string, string> = {}): StubResponse {
  const headers = new Map<string, string | string[]>(Object.entries(initialHeaders));
  const response: StubResponse = {
    headers,
    statusCode: undefined,
    setHeader: jest.fn((name: string, value: string) => headers.set(name, value)),
    getHeader: jest.fn((name: string) => headers.get(name)),
    status: jest.fn((code: number) => {
      response.statusCode = code;
      return response;
    }),
    end: jest.fn(),
  };
  return response;
}

function requestWith(overrides: Record<string, unknown> = {}): Request {
  return { method: 'OPTIONS', headers: {}, ...overrides } as unknown as Request;
}

function run(
  middleware: CorsPreflightMiddleware,
  request: Request,
  response: StubResponse,
): jest.Mock {
  const next = jest.fn();
  middleware.use(request, response as unknown as Response, next as unknown as NextFunction);
  return next;
}

describe('CorsPreflightMiddleware (#1604)', () => {
  it('exposes its options token', () => {
    expect(CORS_PREFLIGHT_OPTIONS).toBeDefined();
  });

  it('answers wildcard preflight with 204 and default headers', () => {
    const middleware = new CorsPreflightMiddleware();
    const res = responseStub();

    const next = run(middleware, requestWith({ headers: { origin: 'https://any.example' } }), res);

    expect(res.statusCode).toBe(204);
    expect(res.end).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('PATCH');
    expect(res.headers.get('Access-Control-Max-Age')).toBe(String(DEFAULT_CORS_MAX_AGE_SECONDS));
  });

  it('reflects an explicitly allowed origin and adds Vary: Origin', () => {
    const middleware = new CorsPreflightMiddleware({
      allowedOrigins: ['https://app.propchain.example'],
    });
    const res = responseStub({ Vary: 'Accept-Encoding' });

    run(middleware, requestWith({ headers: { origin: 'https://app.propchain.example' } }), res);

    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://app.propchain.example');
    expect(res.headers.get('Vary')).toBe('Accept-Encoding, Origin');
  });

  it('does not reflect a disallowed origin', () => {
    const middleware = new CorsPreflightMiddleware({
      allowedOrigins: ['https://app.propchain.example'],
    });
    const res = responseStub();

    run(middleware, requestWith({ headers: { origin: 'https://evil.example' } }), res);

    expect(res.statusCode).toBe(204);
    expect(res.headers.has('Access-Control-Allow-Origin')).toBe(false);
  });

  it('matches regex origins', () => {
    const middleware = new CorsPreflightMiddleware({
      allowedOrigins: [/^https:\/\/[a-z0-9-]+\.propchain\.example$/],
    });
    const res = responseStub();

    run(middleware, requestWith({ headers: { origin: 'https://admin.propchain.example' } }), res);

    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://admin.propchain.example');
  });

  it('sends credentials for an allowed specific origin', () => {
    const middleware = new CorsPreflightMiddleware({
      allowedOrigins: ['https://app.propchain.example'],
      allowCredentials: true,
    });
    const res = responseStub();

    run(middleware, requestWith({ headers: { origin: 'https://app.propchain.example' } }), res);

    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
  });

  it('never combines a wildcard with credentials', () => {
    const middleware = new CorsPreflightMiddleware({
      allowedOrigins: ['*'],
      allowCredentials: true,
    });
    const res = responseStub();

    run(middleware, requestWith({ headers: { origin: 'https://any.example' } }), res);

    expect(res.statusCode).toBe(204);
    expect(res.headers.has('Access-Control-Allow-Origin')).toBe(false);
    expect(res.headers.has('Access-Control-Allow-Credentials')).toBe(false);
  });

  it('applies custom methods, headers, max-age and status', () => {
    const middleware = new CorsPreflightMiddleware({
      allowedMethods: ['get', 'post'],
      allowedHeaders: ['X-Custom'],
      maxAgeSeconds: 3600,
      successStatus: 200,
    });
    const res = responseStub();

    run(middleware, requestWith(), res);

    expect(res.statusCode).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST');
    expect(res.headers.get('Access-Control-Allow-Headers')).toBe('X-Custom');
    expect(res.headers.get('Access-Control-Max-Age')).toBe('3600');
  });

  it('passes non-OPTIONS requests through untouched', () => {
    const middleware = new CorsPreflightMiddleware();
    const res = responseStub();

    const next = run(middleware, requestWith({ method: 'GET' }), res);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.end).not.toHaveBeenCalled();
  });
});
