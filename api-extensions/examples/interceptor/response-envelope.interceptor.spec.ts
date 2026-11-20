import {
  CallHandler,
  ExecutionContext,
  InternalServerErrorException,
  NotFoundException,
  RequestTimeoutException,
} from '@nestjs/common';
import { lastValueFrom, NEVER, Observable, of, throwError } from 'rxjs';
import { ResponseEnvelopeInterceptor } from './response-envelope.interceptor';

const createContext = (): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ method: 'GET', originalUrl: '/properties/1' }),
      getResponse: () => ({}),
    }),
    getClass: () => class TestController {},
    getHandler: () => function findOne() {},
  }) as unknown as ExecutionContext;

const handler = <T>(source: Observable<T>): CallHandler<T> => ({ handle: () => source });

describe('ResponseEnvelopeInterceptor (example)', () => {
  it('wraps the handler result in an envelope', async () => {
    const interceptor = new ResponseEnvelopeInterceptor<{ id: string }>();

    const result = await lastValueFrom(interceptor.intercept(createContext(), handler(of({ id: '1' }))));

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ id: '1' });
    expect(result.meta.path).toBe('/properties/1');
    expect(typeof result.meta.durationMs).toBe('number');
  });

  it('passes HttpExceptions through unchanged', async () => {
    const interceptor = new ResponseEnvelopeInterceptor();
    const error = new NotFoundException('missing');

    await expect(
      lastValueFrom(interceptor.intercept(createContext(), handler(throwError(() => error)))),
    ).rejects.toBe(error);
  });

  it('converts unknown errors into InternalServerErrorException', async () => {
    const interceptor = new ResponseEnvelopeInterceptor();

    await expect(
      lastValueFrom(
        interceptor.intercept(createContext(), handler(throwError(() => new Error('db down')))),
      ),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('converts timeouts into RequestTimeoutException', async () => {
    const interceptor = new ResponseEnvelopeInterceptor(5);

    await expect(
      lastValueFrom(interceptor.intercept(createContext(), handler(NEVER))),
    ).rejects.toBeInstanceOf(RequestTimeoutException);
  });
});
