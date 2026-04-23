import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module';
import { UsersModule } from '../users/users.module';
import { SessionsModule } from '../sessions/sessions.module';
import { EmailModule } from '../email/email.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginRateLimitService } from './login-rate-limit.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ApiKeyAuthGuard } from './guards/api-key-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { FacebookAuthGuard } from './guards/facebook-auth.guard';
import { FacebookStrategy } from './strategies/facebook.strategy';

@Module({
  imports: [PrismaModule, UsersModule, SessionsModule, EmailModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtAuthGuard,
    ApiKeyAuthGuard,
    RolesGuard,
    FacebookAuthGuard,
    FacebookStrategy,
  ],
  exports: [AuthService, RolesGuard],
})
export class AuthModule {}

