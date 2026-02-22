import { Injectable } from '@nestjs/common';
import { StructuredLoggerService } from './logger.service';
import { MetricsService } from './metrics.service';

@Injectable()
export class ErrorMonitoringService {
  private totalErrors = 0;

  constructor(
    private readonly logger: StructuredLoggerService,
    private readonly metricsService: MetricsService,
  ) {}

  captureException(exception: unknown, metadata?: Record<string, any>): void {
    this.totalErrors += 1;

    const error = exception instanceof Error ? exception : new Error(String(exception));

    this.logger.error(error.message, error.stack, {
      ...metadata,
      name: error.name,
      type: 'exception',
    });

    this.metricsService.recordError('exception', {
      ...metadata,
      name: error.name,
    });
  }

  getErrorStats(): Record<string, any> {
    return {
      totalErrors: this.totalErrors,
    };
  }
}
