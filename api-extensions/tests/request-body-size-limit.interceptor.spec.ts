import { CallHandler, ExecutionContext, PayloadTooLargeException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of } from 'rxjs';
import {
  MAX_BODY_SIZE_BYTES,
  MaxBodySize,
  RequestBodySizeLimitInterceptor,
} from '../interceptors/request-body-size-limit.interceptor';

describe('RequestBodySizeLimitInterceptor', () => {
  const originalEnv = process.env;
  let interceptor: RequestBodySizeLimitInterceptor;
  const next: CallHandler = { handle: () => of('ok') };

  class DefaultController {}
  const defaultHandler = () => undefined;

  const contextFor = (request: Record<string, unknown> = {}, target?: unknown): ExecutionContext =>
    ({
      getHandler: () => target ?? defaultHandler,
      getClass: () => target ?? DefaultController,
      switchToHttp: () => ({ getRequest: () => request }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.MAX_BODY_SIZE_BYTES;
    interceptor = new RequestBodySizeLimitInterceptor(new Reflector());
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('passes requests within the default limit', async () => {
    const context = contextFor({ headers: { 'content-length': String(MAX_BODY_SIZE_BYTES) } });
    await expect(lastValueFrom(interceptor.intercept(context, next))).resolves.toBe('ok');
  });

  it('rejects oversized payloads with 413', () => {
    const context = contextFor({
      headers: { 'content-length': String(MAX_BODY_SIZE_BYTES + 1) },
      method: 'POST',
      originalUrl: '/properties',
    });
    expect(() => interceptor.intercept(context, next)).toThrow(PayloadTooLargeException);
  });

  it('uses the decorator-configured limit', () => {
    @MaxBodySize(64)
    class SmallUploadController {}

    const context = contextFor({ headers: { 'content-length': '65' } }, SmallUploadController);
    expect(() => interceptor.intercept(context, next)).toThrow(PayloadTooLargeException);
  });

  it('prefers the decorator over the environment limit', async () => {
    process.env.MAX_BODY_SIZE_BYTES = '10';

    @MaxBodySize(4096)
    class LargeUploadController {}

    const context = contextFor({ headers: { 'content-length': '2048' } }, LargeUploadController);
    await expect(lastValueFrom(interceptor.intercept(context, next))).resolves.toBe('ok');
  });

  it('uses the environment limit when no decorator is present', () => {
    process.env.MAX_BODY_SIZE_BYTES = '10';
    const context = contextFor({ headers: { 'content-length': '11' } });
    expect(() => interceptor.intercept(context, next)).toThrow('10 byte limit');
  });

  it('ignores invalid environment limits', async () => {
    process.env.MAX_BODY_SIZE_BYTES = 'not-a-number';
    const context = contextFor({ headers: { 'content-length': '1024' } });
    await expect(lastValueFrom(interceptor.intercept(context, next))).resolves.toBe('ok');
  });

  it('handles array-valued Content-Length headers', () => {
    const context = contextFor({
      headers: { 'content-length': [String(MAX_BODY_SIZE_BYTES + 1), '0'] },
    });
    expect(() => interceptor.intercept(context, next)).toThrow(PayloadTooLargeException);
  });

  it('ignores non-numeric Content-Length values', async () => {
    const context = contextFor({ headers: { 'content-length': 'unknown' } });
    await expect(lastValueFrom(interceptor.intercept(context, next))).resolves.toBe('ok');
  });

  it('handles chunked transfer encoding without a Content-Length header', async () => {
    const context = contextFor({
      headers: { 'transfer-encoding': 'chunked' },
      method: 'POST',
      url: '/properties',
    });
    await expect(lastValueFrom(interceptor.intercept(context, next))).resolves.toBe('ok');
  });

  it('passes requests without headers through unchanged', async () => {
    await expect(lastValueFrom(interceptor.intercept(contextFor(), next))).resolves.toBe('ok');
  });

  it('includes request metadata in the rejection log', () => {
    const warn = jest.spyOn(
      (interceptor as unknown as { logger: { warn: jest.Mock } }).logger,
      'warn',
    );

    class Controller {
      @MaxBodySize(10)
      handler() {
        return undefined;
      }
    }

    const controller = new Controller();
    const decoratedContext = {
      getHandler: () => controller.handler,
      getClass: () => Controller,
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { 'content-length': '999' },
          method: 'PUT',
          url: '/properties/1',
          ip: '203.0.113.4',
          authUser: { sub: 'user-1' },
        }),
      }),
    } as unknown as ExecutionContext;

    expect(() => interceptor.intercept(decoratedContext, next)).toThrow(PayloadTooLargeException);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('user=user-1 ip=203.0.113.4'));
  });
});
