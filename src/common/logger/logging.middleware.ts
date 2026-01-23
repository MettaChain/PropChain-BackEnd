import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { correlationNamespace, CORRELATION_ID_KEY, getCorrelationId } from './correlation-id';
import { LoggerService } from './logger.service';

@Injectable()
export class LoggingMiddleware implements NestMiddleware {
  constructor(private readonly logger: LoggerService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const correlationId = req.headers['x-correlation-id'] || uuidv4();

    correlationNamespace.run(() => {
      correlationNamespace.set(CORRELATION_ID_KEY, correlationId);

      this.logger.logRequest(req.method, req.url, undefined, req.ip);

      const start = Date.now();
      res.on('finish', () => {
        this.logger.logResponse(req.method, req.url, res.statusCode, Date.now() - start);
      });

      next();
    });
  }
}
