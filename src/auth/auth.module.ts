import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module';
import { UsersModule } from '../users/users.module';
import { SessionsModule } from '../sessions/sessions.module';
import { EmailModule } from '../email/email.module';
import { FraudModule } from '../fraud/fraud.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginRateLimitService } from './login-rate-limit.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ApiKeyAuthGuard } from './guards/api-key-auth.guard';
import { RolesGuard } from './guards/roles.guard';

@Module({
  imports: [PrismaModule, UsersModule, SessionsModule, EmailModule, forwardRef(() => FraudModule)],
  controllers: [AuthController],
  providers: [AuthService, LoginRateLimitService, JwtAuthGuard, ApiKeyAuthGuard, RolesGuard],
  exports: [AuthService, RolesGuard, LoginRateLimitService],
})
export class AuthModule {}
