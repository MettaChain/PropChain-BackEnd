// @ts-nocheck

import { IsArray, IsOptional, IsString } from 'class-validator';

export class RpcHealthCheckResult {
  url: string;
  isHealthy: boolean;
  latencyMs: number;
  latestBlockNumber: number | null;
  gasPrice: string | null;
  error: string | null;
  checkedAt: Date;
}

export class RpcProviderStatus {
  url: string;
  isActive: boolean;
  isHealthy: boolean;
  lastCheckAt: Date | null;
  latencyMs: number | null;
  consecutiveFailures: number;
}

export class GasPriceResult {
  low: string;
  medium: string;
  high: string;
  timestamp: Date;
}

export class RpcHealthSummaryDto {
  providers: RpcProviderStatus[];
  activeProvider: string;
  lastCheckAt: Date | null;
  network: string;
}

export class AddRpcProviderDto {
  @IsString()
  url: string;

  @IsOptional()
  @IsString()
  name?: string;
}

export class RemoveRpcProviderDto {
  @IsString()
  url: string;
}
