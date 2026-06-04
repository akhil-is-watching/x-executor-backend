import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { resolveRedisUrl } from './redis-connection.util';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client!: Redis;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const url = resolveRedisUrl(
      this.config.getOrThrow<string>('REDIS_URL'),
      this.config.get<string>('REDIS_PASSWORD'),
      this.config.get<string>('REDIS_USERNAME'),
    );
    this.client = new Redis(url, { maxRetriesPerRequest: 3 });
    this.client.on('error', (err) => {
      this.logger.error(`Redis client error: ${err.message}`);
    });
    try {
      await this.client.ping();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Redis ping failed (${message}). Use the full REDIS_URL from your Redis provider ` +
          '(e.g. Railway: REDIS_URL=${{Redis.REDIS_URL}}). Host-only URLs require REDIS_PASSWORD.',
      );
      throw err;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as T;
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async setex(key: string, ttlSeconds: number, value: string): Promise<void> {
    await this.client.set(key, value, 'EX', ttlSeconds);
  }

  async exists(key: string): Promise<boolean> {
    return (await this.client.exists(key)) > 0;
  }

  async zadd(key: string, score: number, member: string): Promise<void> {
    await this.client.zadd(key, score, member);
  }

  async zrange(key: string, start: number, stop: number): Promise<string[]> {
    return this.client.zrange(key, start, stop);
  }

  async zrem(key: string, member: string): Promise<void> {
    await this.client.zrem(key, member);
  }

  async eval(
    script: string,
    keys: string[],
    args: Array<string | number>,
  ): Promise<unknown> {
    return this.client.eval(
      script,
      keys.length,
      ...keys,
      ...args.map(String),
    );
  }
}
