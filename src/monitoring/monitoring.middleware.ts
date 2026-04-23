import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class MonitoringMiddleware implements NestMiddleware {
  private readonly logger = new Logger(MonitoringMiddleware.name);

  constructor(private readonly prisma: PrismaService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const start = Date.now();
    const { method, path: reqPath, ip } = req;
    const userAgent = req.headers['user-agent'] ?? '';

    res.on('finish', () => {
      const responseTime = Date.now() - start;
      const statusCode = res.statusCode;
      const userId = (req as any).user?.id ?? null;
      const errorMessage = statusCode >= 400 ? res.statusMessage || null : null;

      this.prisma.apiRequestLog
        .create({
          data: {
            method,
            path: reqPath,
            statusCode,
            responseTime,
            userId,
            ipAddress: ip,
            userAgent,
            errorMessage,
          },
        })
        .catch((err) =>
          this.logger.warn(`Failed to log request: ${err.message}`),
        );
    });

    next();
  }
}