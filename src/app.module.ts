import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { SessionsModule } from './sessions/sessions.module';
import { TrustScoreModule } from './trust-score/trust-score.module';
import { PropertiesModule } from './properties/properties.module';
import { PrismaModule } from './database/prisma.module';
import { VersioningModule } from './versioning/versioning.module';
import { ApiDocumentationModule } from './config/api-documentation.module';
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    PrismaModule,
    VersioningModule,
    ApiDocumentationModule,
    UsersModule,
    AuthModule,
    DashboardModule,
    SessionsModule,
    TrustScoreModule,
    PropertiesModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
