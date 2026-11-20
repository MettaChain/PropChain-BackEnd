import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of } from 'rxjs';
import { gzipSync } from 'zlib';
import {
  CompressResponse,
  DEFAULT_COMPRESSION_THRESHOLD,
  ResponseCompressionInterceptor,
} from '../interceptors/response-compression.interceptor';

describe('ResponseCompressionInterceptor', () => {
  const originalEnv = process.env;
  let interceptor: ResponseCompressionInterceptor;
  let headers: Map<string, string | number>;

  const response = {
    getHeader: (name: string) => headers.get(name),
    setHeader: (name: string, value: string | number) => headers.set(name, value),
  };

  const contextFor = (acceptEncoding?: string | string[], target?: unknown): ExecutionContext => {
    const defaultHandler = () => undefined;
    class DefaultController {}
    return {
      getHandler: () => target ?? defaultHandler,
      getClass: () => target ?? DefaultController,
      switchToHttp: () => ({
        getRequest: () => ({
          headers: acceptEncoding ? { 'accept-encoding': acceptEncoding } : {},
        }),
        getResponse: () => response,
      }),
    } as unknown as ExecutionContext;
  };

  const run = async (payload: unknown, context: ExecutionContext) =>
    lastValueFrom(interceptor.intercept(context, { handle: () => of(payload) }));

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.RESPONSE_COMPRESSION_THRESHOLD;
    delete process.env.RESPONSE_COMPRESSION_LEVEL;
    headers = new Map();
    interceptor = new ResponseCompressionInterceptor(new Reflector());
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('compresses with gzip when Accept-Encoding includes gzip', async () => {
    const payload = 'x'.repeat(2048);
    const result = await run(payload, contextFor('deflate;q=0.5, gzip;q=1'));

    expect(Buffer.isBuffer(result)).toBe(true);
    expect((result as Buffer).equals(gzipSync(Buffer.from(payload)))).toBe(true);
    expect(headers.get('Content-Encoding')).toBe('gzip');
    expect(headers.get('Content-Length')).toBe((result as Buffer).length);
    expect(headers.get('Vary')).toBe('Accept-Encoding');
  });

  it('compresses with deflate when only deflate is accepted', async () => {
    const payload = Buffer.from('y'.repeat(DEFAULT_COMPRESSION_THRESHOLD));
    const result = await run(payload, contextFor('br, deflate'));

    expect(Buffer.isBuffer(result)).toBe(true);
    expect(headers.get('Content-Encoding')).toBe('deflate');
  });

  it('does not compress responses smaller than the threshold', async () => {
    const payload = 'short response';
    const result = await run(payload, contextFor('gzip'));

    expect(result).toBe(payload);
    expect(headers.has('Content-Encoding')).toBe(false);
  });

  it('does not compress when Accept-Encoding is absent', async () => {
    const payload = 'x'.repeat(2048);
    expect(await run(payload, contextFor())).toBe(payload);
  });

  it('does not compress unsupported encodings', async () => {
    const payload = 'x'.repeat(2048);
    expect(await run(payload, contextFor('br'))).toBe(payload);
  });

  it('handles array-valued Accept-Encoding headers', async () => {
    const result = await run('x'.repeat(2048), contextFor(['br', 'gzip']));
    expect(headers.get('Content-Encoding')).toBe('gzip');
    expect(Buffer.isBuffer(result)).toBe(true);
  });

  it('leaves non-string and non-buffer payloads untouched', async () => {
    const payload = { message: 'ok' };
    expect(await run(payload, contextFor('gzip'))).toBe(payload);
  });

  it('uses the decorator threshold and compression level', async () => {
    const payload = 'a'.repeat(100);
    @CompressResponse({ threshold: 50, level: 9 })
    class Controller {}

    const result = await run(payload, contextFor('gzip', Controller));
    expect((result as Buffer).equals(gzipSync(Buffer.from(payload), { level: 9 }))).toBe(true);
  });

  it('supports the compression decorator without explicit options', async () => {
    @CompressResponse()
    class Controller {}

    expect(Buffer.isBuffer(await run('x'.repeat(2048), contextFor('gzip', Controller)))).toBe(true);
  });

  it('does not compress when the decorator threshold is not reached', async () => {
    @CompressResponse({ threshold: 5000 })
    class Controller {}

    const payload = 'x'.repeat(2000);
    expect(await run(payload, contextFor('gzip', Controller))).toBe(payload);
  });

  it('reads the threshold and level from the environment', async () => {
    process.env.RESPONSE_COMPRESSION_THRESHOLD = '10';
    process.env.RESPONSE_COMPRESSION_LEVEL = '6';
    const payload = 'x'.repeat(100);

    const result = await run(payload, contextFor('gzip'));
    expect((result as Buffer).equals(gzipSync(Buffer.from(payload), { level: 6 }))).toBe(true);
  });

  it('ignores invalid environment configuration', async () => {
    process.env.RESPONSE_COMPRESSION_THRESHOLD = 'invalid';
    process.env.RESPONSE_COMPRESSION_LEVEL = 'invalid';
    const payload = 'x'.repeat(DEFAULT_COMPRESSION_THRESHOLD);

    expect(Buffer.isBuffer(await run(payload, contextFor('gzip')))).toBe(true);
  });
});
