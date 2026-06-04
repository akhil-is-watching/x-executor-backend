export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const required = ['MONGODB_URI', 'NATS_URL', 'WEBHOOK_PUBLIC_BASE_URL'] as const;

  for (const key of required) {
    if (!config[key] || typeof config[key] !== 'string') {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  const hasConsumerSecret =
    (typeof config.X_API_KEY_SECRET === 'string' &&
      config.X_API_KEY_SECRET.trim().length > 0) ||
    (typeof config.X_CONSUMER_SECRET === 'string' &&
      config.X_CONSUMER_SECRET.trim().length > 0) ||
    (typeof config.X_CLIENT_SECRET === 'string' &&
      config.X_CLIENT_SECRET.trim().length > 0);

  if (!hasConsumerSecret) {
    throw new Error(
      'Missing X_API_KEY_SECRET (preferred), X_CONSUMER_SECRET, or X_CLIENT_SECRET — OAuth 1.0 API Key Secret for CRC/signatures',
    );
  }

  return config;
}
