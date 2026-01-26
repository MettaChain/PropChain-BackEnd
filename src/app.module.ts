import { Module, NestModule, MiddlewareConsumer, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { TerminusModule } from '@nestjs/terminus';
import { BullModule } from '@nestjs/bull';
import { RedisModule } from '@liaoliaots/nestjs-redis'; 
import { PrismaModule } from './database/prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { LoggerModule } from './common/logger/logger.module';
import { ConfigurationModule } from './config/configuration.module';
import { PropertiesModule } from './properties/properties.module';
import { UsersModule } from './users/users.module';
import { TransactionsModule } from './transactions/transactions.module';
import { BlockchainModule } from './blockchain/blockchain.module';
import { AuthModule } from './auth/auth.module';
import { FilesModule } from './files/files.module';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { DocumentsModule } from './documents/documents.module';
import { AuthRateLimitMiddleware } from './auth/middleware/auth.middleware';
import { PaginationModule } from './common/pagination/pagination.module';
import { RedisService } from './common/services/redis.service'; 
import configuration from './config/configuration';
import Redis from 'ioredis'; // Added import for the manual provider

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env.local', '.env.development', '.env'],
    }),
    ConfigurationModule,

    // Keep this for library internal use (like Bull/Throttler if they need it)
    RedisModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        config: {
          host: configService.get<string>('REDIS_HOST', 'localhost'),
          port: configService.get<number>('REDIS_PORT', 6379),
          password: configService.get<string>('REDIS_PASSWORD'),
          db: configService.get<number>('REDIS_DB', 0),
        },
      }),
    }),

    LoggerModule,
    PrismaModule,
    HealthModule,
    PaginationModule,

    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => [
        {
          ttl: configService.get<number>('THROTTLE_TTL', 60),
          limit: configService.get<number>('THROTTLE_LIMIT', 10),
        },
      ],
    }),

    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        redis: {
          host: configService.get<string>('REDIS_HOST', 'localhost'),
          port: configService.get<number>('REDIS_PORT', 6379),
          password: configService.get<string>('REDIS_PASSWORD'),
          db: configService.get<number>('REDIS_DB', 0),
        },
      }),
    }),

    ScheduleModule.forRoot(),
    TerminusModule,
    AuthModule,
    ApiKeysModule,
    UsersModule,
    PropertiesModule,
    TransactionsModule,
    BlockchainModule,
    FilesModule,
    DocumentsModule,
  ],
  controllers: [],
  providers: [
    RedisService,
    // MANUAL PROVIDER: This explicitly defines the 'default' token
    {
      provide: 'default',
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        return new Redis({
          host: configService.get<string>('REDIS_HOST', 'localhost'),
          port: configService.get<number>('REDIS_PORT', 6379),
          password: configService.get<string>('REDIS_PASSWORD'),
          db: configService.get<number>('REDIS_DB', 0),
        });
      },
    },
  ], 
  exports: [RedisService],   
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(AuthRateLimitMiddleware)
      .forRoutes('/auth*');
  }
}