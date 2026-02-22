import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RedisService } from '../../common/services/redis.service';
import { ConfigService } from '@nestjs/config';
import { StructuredLoggerService } from '../../common/logging/logger.service';

@Injectable()
export class LoginAttemptsGuard extends AuthGuard('local') {
  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly logger: StructuredLoggerService,
  ) {
    super();
    this.logger.setContext('LoginAttemptsGuard');
  }

  async canActivate(context: any): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const { email } = request.body;
    const ip = this.getClientIp(request);

    if (!email) {
      return false;
    }

    // Check if account is locked
    const isLocked = await this.isAccountLocked(email, ip);
    if (isLocked) {
      this.logger.warn('Login attempt blocked - account locked', { email, ip });
      throw new UnauthorizedException('Account temporarily locked due to too many failed attempts');
    }

    try {
      const result = (await super.canActivate(context)) as boolean;

      if (result) {
        // Successful login - reset attempt counters
        await this.resetLoginAttempts(email, ip);
        this.logger.logAuth('Successful login', { email, ip });
      }

      return result;
    } catch (error) {
      // Failed login - increment attempt counters
      await this.recordFailedAttempt(email, ip);
      this.logger.warn('Failed login attempt', { email, ip });
      throw error;
    }
  }

  private async isAccountLocked(email: string, ip: string): Promise<boolean> {
    const maxAttempts = this.configService.get<number>('LOGIN_MAX_ATTEMPTS', 5);
    const lockoutDuration = this.configService.get<number>('LOGIN_LOCKOUT_DURATION', 900);

    // Check email-based attempts
    const emailAttempts = await this.getLoginAttempts(`login_attempts:${email}`);
    if (emailAttempts >= maxAttempts) {
      return true;
    }

    // Check IP-based attempts
    const ipAttempts = await this.getLoginAttempts(`login_attempts:ip:${ip}`);
    if (ipAttempts >= maxAttempts) {
      return true;
    }

    return false;
  }

  private async recordFailedAttempt(email: string, ip: string): Promise<void> {
    const lockoutDuration = this.configService.get<number>('LOGIN_LOCKOUT_DURATION', 900);

    // Increment email attempts
    await this.incrementLoginAttempts(`login_attempts:${email}`, lockoutDuration);

    // Increment IP attempts
    await this.incrementLoginAttempts(`login_attempts:ip:${ip}`, lockoutDuration);
  }

  private async resetLoginAttempts(email: string, ip: string): Promise<void> {
    await this.redisService.del(`login_attempts:${email}`);
    await this.redisService.del(`login_attempts:ip:${ip}`);
  }

  private async getLoginAttempts(key: string): Promise<number> {
    const attempts = await this.redisService.get(key);
    return attempts ? parseInt(attempts, 10) : 0;
  }

  private async incrementLoginAttempts(key: string, expirySeconds: number): Promise<void> {
    const current = await this.getLoginAttempts(key);
    await this.redisService.setex(key, expirySeconds, (current + 1).toString());
  }

  private getClientIp(request: any): string {
    return request.ips?.length ? request.ips[0] : request.ip;
  }
}
