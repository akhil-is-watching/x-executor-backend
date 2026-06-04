import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '@app/redis';
import { RedisLeakyBucket } from './redis-leaky-bucket';

@Injectable()
export class GetxapiRateLimiterService {
  private readonly bucket: RedisLeakyBucket;

  constructor(
    redis: RedisService,
    config: ConfigService,
  ) {
    this.bucket = new RedisLeakyBucket(redis, {
      capacity: readPositiveInt(config, 'GETXAPI_RATE_CAPACITY', 5),
      leakIntervalMs: readPositiveInt(
        config,
        'GETXAPI_RATE_LEAK_INTERVAL_MS',
        1000,
      ),
      jitterMinMs: readNonNegativeInt(config, 'GETXAPI_RATE_JITTER_MIN_MS', 100),
      jitterMaxMs: readNonNegativeInt(config, 'GETXAPI_RATE_JITTER_MAX_MS', 500),
      keyPrefix:
        config.get<string>('GETXAPI_RATE_REDIS_PREFIX') ?? 'getxapi:rate',
      queuePollMs: readPositiveInt(config, 'GETXAPI_RATE_QUEUE_POLL_MS', 100),
      ticketTtlSeconds: readPositiveInt(
        config,
        'GETXAPI_RATE_TICKET_TTL_SEC',
        300,
      ),
    });
  }

  acquire(): Promise<void> {
    return this.bucket.acquire();
  }
}

function readPositiveInt(
  config: ConfigService,
  name: string,
  fallback: number,
): number {
  const raw = config.get<string>(name);
  if (raw === undefined || raw === '') {
    return fallback;
  }
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function readNonNegativeInt(
  config: ConfigService,
  name: string,
  fallback: number,
): number {
  const raw = config.get<string>(name);
  if (raw === undefined || raw === '') {
    return fallback;
  }
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}
