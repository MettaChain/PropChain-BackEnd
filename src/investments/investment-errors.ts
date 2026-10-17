import {
  BadRequestException,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { logInvestmentEvent } from './investment-logger';

export const investmentNotFound = (id: string) =>
  new NotFoundException(`Investment with ID ${id} not found`);

export const invalidInvestmentAmount = () =>
  new BadRequestException('Investment amount must be greater than zero');

/**
 * Normalises unknown errors from the Investment API: HTTP exceptions pass through,
 * anything else is logged and returned as a generic 500 so internals are not leaked.
 */
export function toInvestmentHttpError(error: unknown, operation: string): HttpException {
  if (error instanceof HttpException) return error;
  logInvestmentEvent(
    'investment.unexpected_error',
    { operation, message: error instanceof Error ? error.message : String(error) },
    'error',
  );
  return new InternalServerErrorException('Unexpected error while processing investment request');
}
