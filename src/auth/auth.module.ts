import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { Web3Strategy } from './strategies/web3.strategy';
import { RedisService } from '../common/services/redis.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          // FIX: Cast to any to handle the string/number type mismatch for the build
          expiresIn: (configService.get<string>('JWT_EXPIRES_IN') as any) || '15m',
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    // REMOVED: LocalStrategy (because it expects passwords)
    Web3Strategy,
    RedisService,
  ],
  exports: [AuthService],
})
export class AuthModule {}