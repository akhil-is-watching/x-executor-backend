import { resolveRedisUrl } from './redis-connection.util';

describe('resolveRedisUrl', () => {
  it('returns url unchanged when password is already embedded', () => {
    const url = 'redis://default:secret@redis.internal:6379';
    expect(resolveRedisUrl(url, 'other')).toBe(url);
  });

  it('injects password and default username when missing from url', () => {
    expect(
      resolveRedisUrl('redis://redis.internal:6379', 'my-secret'),
    ).toBe('redis://default:my-secret@redis.internal:6379');
  });

  it('uses custom username when provided', () => {
    expect(
      resolveRedisUrl('redis://redis.internal:6379', 'pw', 'admin'),
    ).toBe('redis://admin:pw@redis.internal:6379');
  });
});
