import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module';
import { UsersModule } from '../users/users.module';
import { SessionsModule } from '../sessions/sessions.module';
import { EmailModule } from '../email/email.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginRateLimitService } from './login-rate-limit.service';
import { RateLimitService } from './rate-limit.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ApiKeyAuthGuard } from './guards/api-key-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { RateLimitGuard } from './guards/rate-limit.guard';
import { RateLimitHeadersInterceptor } from './interceptors/rate-limit-headers.interceptor';
import { RateLimitAdminController } from './controllers/rate-limit-admin.controller';

@Module({
  imports: [PrismaModule, UsersModule, SessionsModule, EmailModule],
  controllers: [AuthController, RateLimitAdminController],
  providers: [
    AuthService,
    LoginRateLimitService,
    RateLimitService,
    JwtAuthGuard,
    ApiKeyAuthGuard,
    RolesGuard,
    RateLimitGuard,
    RateLimitHeadersInterceptor,
  ],
  exports: [
    AuthService,
    RolesGuard,
    LoginRateLimitService,
    RateLimitService,
    RateLimitGuard,
    RateLimitHeadersInterceptor,
  ],
})
export class AuthModule {}
