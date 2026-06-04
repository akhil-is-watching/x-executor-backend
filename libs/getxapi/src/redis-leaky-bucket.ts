import { randomUUID } from 'crypto';
import type { RedisService } from '@app/redis';
import { randomIntInclusive, sleep } from './rate-limit.util';

export interface RedisLeakyBucketConfig {
  capacity: number;
  leakIntervalMs: number;
  jitterMinMs: number;
  jitterMaxMs: number;
  keyPrefix: string;
  queuePollMs: number;
  ticketTtlSeconds: number;
}

const CONSUME_SCRIPT = `
local stateKey = KEYS[1]
local capacity = tonumber(ARGV[1])
local leakIntervalMs = tonumber(ARGV[2])
local now = tonumber(ARGV[3])

local water = tonumber(redis.call('HGET', stateKey, 'water') or '0')
local lastLeakAt = tonumber(redis.call('HGET', stateKey, 'lastLeakAt') or tostring(now))

local leakPerMs = 1.0 / leakIntervalMs
local elapsed = math.max(0, now - lastLeakAt)
if elapsed > 0 then
  water = math.max(0, water - elapsed * leakPerMs)
  lastLeakAt = now
end

if water < capacity then
  water = water + 1
  redis.call('HSET', stateKey, 'water', tostring(water), 'lastLeakAt', tostring(lastLeakAt))
  return {1, 0}
end

local overflow = water - capacity + 1
local waitMs = math.ceil(overflow / leakPerMs)
redis.call('HSET', stateKey, 'water', tostring(water), 'lastLeakAt', tostring(lastLeakAt))
return {0, waitMs}
`;

/**
 * Distributed leaky-bucket limiter with a Redis-backed FIFO wait queue.
 */
export class RedisLeakyBucket {
  private readonly stateKey: string;
  private readonly queueKey: string;
  private readonly ticketPrefix: string;

  constructor(
    private readonly redis: RedisService,
    private readonly config: RedisLeakyBucketConfig,
  ) {
    this.stateKey = `${config.keyPrefix}:state`;
    this.queueKey = `${config.keyPrefix}:queue`;
    this.ticketPrefix = `${config.keyPrefix}:ticket`;
  }

  async acquire(): Promise<void> {
    const ticket = randomUUID();
    const ticketKey = `${this.ticketPrefix}:${ticket}`;

    await this.redis.setex(ticketKey, this.config.ticketTtlSeconds, '1');
    await this.redis.zadd(this.queueKey, Date.now(), ticket);

    try {
      while (true) {
        await this.redis.setex(ticketKey, this.config.ticketTtlSeconds, '1');
        await this.waitForTurn(ticket);

        const result = (await this.redis.eval(CONSUME_SCRIPT, [this.stateKey], [
          this.config.capacity,
          this.config.leakIntervalMs,
          Date.now(),
        ])) as [number, number];

        const granted = Number(result[0]) === 1;
        const waitMs = Number(result[1]);

        if (granted) {
          await this.applyJitter();
          return;
        }

        if (waitMs > 0) {
          await sleep(waitMs);
        }
      }
    } finally {
      await this.redis.zrem(this.queueKey, ticket);
      await this.redis.del(ticketKey);
    }
  }

  private async waitForTurn(ticket: string): Promise<void> {
    while (true) {
      await this.removeStaleHead();
      const head = await this.redis.zrange(this.queueKey, 0, 0);
      if (head[0] === ticket) {
        return;
      }
      await sleep(this.config.queuePollMs);
    }
  }

  private async removeStaleHead(): Promise<void> {
    for (let i = 0; i < 8; i += 1) {
      const head = await this.redis.zrange(this.queueKey, 0, 0);
      if (!head.length) {
        return;
      }
      const ticket = head[0];
      const alive = await this.redis.exists(`${this.ticketPrefix}:${ticket}`);
      if (alive) {
        return;
      }
      await this.redis.zrem(this.queueKey, ticket);
    }
  }

  private async applyJitter(): Promise<void> {
    const { jitterMinMs, jitterMaxMs } = this.config;
    if (jitterMaxMs <= 0 && jitterMinMs <= 0) {
      return;
    }
    await sleep(randomIntInclusive(jitterMinMs, jitterMaxMs));
  }
}
