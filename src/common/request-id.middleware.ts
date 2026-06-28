import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AsyncLocalStorage } from 'async_hooks';

export const REQUEST_ID_HEADER = 'X-Request-Id';

export const requestIdStorage = new AsyncLocalStorage<Map<string, string>>();

export function getCurrentRequestId(): string | undefined {
  return requestIdStorage.getStore()?.get('requestId');
}

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const store = new Map<string, string>();
    const requestId = (req.headers[REQUEST_ID_HEADER.toLowerCase()] as string) || uuidv4();
    store.set('requestId', requestId);
    res.setHeader(REQUEST_ID_HEADER, requestId);
    requestIdStorage.run(store, () => next());
  }
}
