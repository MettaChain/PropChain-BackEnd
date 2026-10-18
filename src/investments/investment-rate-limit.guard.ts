import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';

export const INVESTMENT_RATE_LIMIT = { windowMs: 60_000, max: 30 };

/** Simple in-memory, per-IP fixed-window rate limiter for the Investment API. */
@Injectable()
export class InvestmentRateLimitGuard implements CanActivate {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const key = req.ip || 'unknown';
    const now = Date.now();
    const entry = this.hits.get(key);

    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + INVESTMENT_RATE_LIMIT.windowMs });
      return true;
    }

    entry.count++;
    if (entry.count > INVESTMENT_RATE_LIMIT.max) {
      throw new HttpException('Too many requests, please try again later', HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }
}
