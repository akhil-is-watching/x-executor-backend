/**
 * Railway and other managed Redis instances require auth. Use the plugin's full
 * REDIS_URL (includes password). If the URL has no password, REDIS_PASSWORD is applied.
 */
export function resolveRedisUrl(
  url: string,
  password?: string | null,
  username?: string | null,
): string {
  const parsed = new URL(url);
  if (parsed.password || !password) {
    return url;
  }
  parsed.password = password;
  if (!parsed.username) {
    parsed.username = username ?? 'default';
  }
  return parsed.toString();
}
