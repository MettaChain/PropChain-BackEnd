// @ts-nocheck

import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SessionDto {
  id: string;
  accessTokenJti: string;
  refreshTokenJti?: string;
  ipAddress?: string;
  userAgent?: string;
  displayName?: string;
  deviceInfo?: {
    browser?: string;
    os?: string;
    deviceType?: string;
  };
  geoLocation?: {
    country?: string;
    city?: string;
    region?: string;
  };
  isRevoked: boolean;
  expiresAt: Date;
  createdAt: Date;
  lastActivityAt: Date;
  revokedAt?: Date;
  isCurrent?: boolean;
}

export class SessionsListDto {
  sessions: SessionDto[];
  activeCount: number;
  revokedCount: number;
}

export class RevokeSessionDto {
  message: string;
  sessionId: string;
}

export class RevokeAllSessionsDto {
  message: string;
  revokedCount: number;
}

export class UpdateSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  displayName?: string;
}

export class SessionDeviceDto {
  browser?: string;
  os?: string;
  deviceType?: string;
}

export class SessionGeoDto {
  country?: string;
  city?: string;
  region?: string;
}
