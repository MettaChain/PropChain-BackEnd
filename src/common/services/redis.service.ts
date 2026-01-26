import { Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';

@Injectable()
export class RedisService {
  private readonly redis: Redis;

  constructor(private readonly redisService: NestRedisService) {
    this.redis = this.redisService.getOrThrow();
  }

  async get(key: string): Promise<string | null> {
    return await this.redis.get(key);
  }

  async set(key: string, value: string, seconds?: number): Promise<string> {
    if (seconds) {
      return await this.redis.set(key, value, 'EX', seconds);
    }
    return await this.redis.set(key, value);
  }

  async setex(key: string, seconds: number, value: string): Promise<string> {
    return await this.redis.setex(key, seconds, value);
  }

  async del(key: string): Promise<number> {
    return await this.redis.del(key);
  }

  async ttl(key: string): Promise<number> {
    return await this.redis.ttl(key);
  }

  async incr(key: string): Promise<number> {
    return await this.redis.incr(key);
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.redis.exists(key);
    return result === 1;
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    const result = await this.redis.expire(key, seconds);
    return result === 1;
  }

  async keys(pattern: string): Promise<string[]> {
    return await this.redis.keys(pattern);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return await this.redis.hgetall(key);
  }

  async hset(key: string, field: string, value: string): Promise<number> {
    return await this.redis.hset(key, field, value);
  }

  async hdel(key: string, field: string): Promise<number> {
    return await this.redis.hdel(key, field);
  }
}