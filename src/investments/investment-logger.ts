import { Logger } from '@nestjs/common';

const logger = new Logger('InvestmentAPI');

/**
 * Structured log helper for the Investment API. Emits a single JSON line with a
 * fixed `event` name plus context fields so logs are easy to query.
 */
export function logInvestmentEvent(
  event: string,
  context: Record<string, unknown> = {},
  level: 'log' | 'warn' | 'error' = 'log',
): void {
  logger[level](JSON.stringify({ event, ...context, timestamp: new Date().toISOString() }));
}
