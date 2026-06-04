import { RedisService } from '@app/redis';
import { RedisLeakyBucket } from './redis-leaky-bucket';

describe('RedisLeakyBucket', () => {
  const queue = new Map<string, number>();
  const tickets = new Set<string>();
  let state: { water: number; lastLeakAt: number } = { water: 0, lastLeakAt: Date.now() };

  const redis = {
    setex: jest.fn(async (key: string, _ttl: number, value: string) => {
      if (key.includes(':ticket:')) {
        tickets.add(key);
      }
      void value;
    }),
    exists: jest.fn(async (key: string) => tickets.has(key)),
    del: jest.fn(async (key: string) => {
      tickets.delete(key);
    }),
    zadd: jest.fn(async (_key: string, score: number, member: string) => {
      queue.set(member, score);
    }),
    zrange: jest.fn(async (_key: string, start: number, stop: number) => {
      const ordered = [...queue.entries()].sort((a, b) => a[1] - b[1]);
      return ordered.slice(start, stop + 1).map(([member]) => member);
    }),
    zrem: jest.fn(async (_key: string, member: string) => {
      queue.delete(member);
    }),
    eval: jest.fn(async () => {
      const now = Date.now();
      const elapsed = Math.max(0, now - state.lastLeakAt);
      if (elapsed > 0) {
        state.water = Math.max(0, state.water - elapsed / 1000);
        state.lastLeakAt = now;
      }
      if (state.water < 1) {
        state.water += 1;
        return [1, 0];
      }
      return [0, 1000];
    }),
  } as unknown as RedisService;

  beforeEach(() => {
    queue.clear();
    tickets.clear();
    state = { water: 0, lastLeakAt: Date.now() };
    jest.useFakeTimers();
    jest.spyOn(Math, 'random').mockReturnValue(0);
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('grants immediately when under capacity', async () => {
    const bucket = new RedisLeakyBucket(redis, {
      capacity: 2,
      leakIntervalMs: 1000,
      jitterMinMs: 0,
      jitterMaxMs: 0,
      keyPrefix: 'test:rate',
      queuePollMs: 10,
      ticketTtlSeconds: 60,
    });

    await bucket.acquire();
    expect(redis.eval).toHaveBeenCalled();
    expect(queue.size).toBe(0);
  });

  it('serializes callers through the redis queue', async () => {
    state.water = 1;

    const bucket = new RedisLeakyBucket(redis, {
      capacity: 1,
      leakIntervalMs: 1000,
      jitterMinMs: 0,
      jitterMaxMs: 0,
      keyPrefix: 'test:rate',
      queuePollMs: 10,
      ticketTtlSeconds: 60,
    });

    const first = bucket.acquire();
    const second = bucket.acquire();

    await jest.advanceTimersByTimeAsync(1000);
    await first;
    expect(queue.size).toBe(1);

    await jest.advanceTimersByTimeAsync(1000);
    await second;
    expect(queue.size).toBe(0);
  });
});
