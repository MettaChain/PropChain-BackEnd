import { Injectable, Scope, LoggerService as NestLoggerService } from '@nestjs/common';
import * as winston from 'winston';
import { ConfigService } from '@nestjs/config';
import { createWinstonLogger, LOG_CATEGORIES } from './logging.config';
import { getCorrelationId, getTraceId } from './correlation-id';

/**
 * Structured logging service with Winston
 * Provides centralized logging with correlation IDs, log levels, and sensitive data filtering
 */
@Injectable({ scope: Scope.TRANSIENT })
export class StructuredLoggerService implements NestLoggerService {
  private logger: winston.Logger;
  private context?: string;

  constructor(private readonly configService: ConfigService) {
    const environment = this.configService.get<string>('NODE_ENV', 'development');
    this.logger = createWinstonLogger(environment);
  }

  /**
   * Set the context (category) for log messages
   */
  setContext(context: string) {
    this.context = context;
  }

  /**
   * Get the current context
   */
  getContext(): string | undefined {
    return this.context;
  }

  /**
   * Info level logging
   */
  log(message: string, metadata?: Record<string, any>) {
    this.logger.info(message, this.buildLogMetadata(metadata));
  }

  /**
   * Error level logging
   */
  error(message: string, stack?: string, metadata?: Record<string, any>) {
    this.logger.error(message, {
      ...this.buildLogMetadata(metadata),
      stack,
      category: LOG_CATEGORIES.ERROR,
    });
  }

  /**
   * Warning level logging
   */
  warn(message: string, metadata?: Record<string, any>) {
    this.logger.warn(message, this.buildLogMetadata(metadata));
  }

  /**
   * Debug level logging
   */
  debug(message: string, metadata?: Record<string, any>) {
    this.logger.debug(message, this.buildLogMetadata(metadata));
  }

  /**
   * Verbose level logging (detailed debug info)
   */
  verbose(message: string, metadata?: Record<string, any>) {
    this.logger.verbose(message, this.buildLogMetadata(metadata));
  }

  /**
   * Fatal error logging
   */
  fatal(message: string, stack?: string, metadata?: Record<string, any>) {
    this.logger.error(message, {
      ...this.buildLogMetadata(metadata),
      stack,
      level: 'fatal',
      category: LOG_CATEGORIES.ERROR,
    });
  }

  /**
   * Log HTTP request
   */
  logRequest(method: string, path: string, metadata?: Record<string, any>) {
    this.logger.info(`${method} ${path}`, {
      ...this.buildLogMetadata(metadata),
      category: LOG_CATEGORIES.HTTP,
      type: 'REQUEST',
    });
  }

  /**
   * Log HTTP response
   */
  logResponse(method: string, path: string, statusCode: number, duration: number, metadata?: Record<string, any>) {
    const logLevel = statusCode >= 400 ? 'warn' : 'info';
    this.logger[logLevel](`${method} ${path} ${statusCode} (${duration}ms)`, {
      ...this.buildLogMetadata(metadata),
      category: LOG_CATEGORIES.HTTP,
      type: 'RESPONSE',
      statusCode,
      duration,
    });
  }

  /**
   * Log authentication event
   */
  logAuth(action: string, metadata?: Record<string, any>) {
    this.logger.info(`Authentication: ${action}`, {
      ...this.buildLogMetadata(metadata),
      category: LOG_CATEGORIES.AUTH,
    });
  }

  /**
   * Log database operation
   */
  logDatabase(operation: string, duration: number, metadata?: Record<string, any>) {
    this.logger.debug(`Database ${operation} (${duration}ms)`, {
      ...this.buildLogMetadata(metadata),
      category: LOG_CATEGORIES.DATABASE,
      duration,
    });
  }

  /**
   * Log blockchain operation
   */
  logBlockchain(operation: string, metadata?: Record<string, any>) {
    this.logger.info(`Blockchain: ${operation}`, {
      ...this.buildLogMetadata(metadata),
      category: LOG_CATEGORIES.BLOCKCHAIN,
    });
  }

  /**
   * Log transaction
   */
  logTransaction(action: string, transactionId?: string, metadata?: Record<string, any>) {
    this.logger.info(`Transaction ${action}`, {
      ...this.buildLogMetadata(metadata),
      category: LOG_CATEGORIES.TRANSACTION,
      transactionId,
    });
  }

  /**
   * Log validation error
   */
  logValidation(field: string, error: string, metadata?: Record<string, any>) {
    this.logger.warn(`Validation Error: ${field}`, {
      ...this.buildLogMetadata(metadata),
      category: LOG_CATEGORIES.VALIDATION,
      field,
      error,
    });
  }

  private buildLogMetadata(metadata?: Record<string, any>): Record<string, any> {
    const correlationId = getCorrelationId();
    const traceId = getTraceId();
    return {
      correlationId,
      traceId,
      context: this.context,
      timestamp: new Date().toISOString(),
      ...metadata,
    };
  }
}
