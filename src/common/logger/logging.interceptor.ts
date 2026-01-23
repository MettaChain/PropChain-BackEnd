import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { getCorrelationId } from './correlation-id';
import { LoggerService } from './logger.service';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: LoggerService) {} // ✅ inject LoggerService

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const correlationId = getCorrelationId();

    this.logger.log(
      {
        message: 'Handling request',
        method: req.method,
        url: req.url,
        correlationId,
      },
      this.logger['context'], // optional context
    );

    const now = Date.now();
    return next.handle().pipe(
      tap(() => {
        const res = context.switchToHttp().getResponse();
        this.logger.log(
          {
            message: 'Handling request',
            method: req.method,
            url: req.url,
            correlationId,
          },
          this.logger['context'], // optional context
        );
      }),
    );
  }
}
