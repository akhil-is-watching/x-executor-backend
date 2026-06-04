export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const required = [
    'MONGODB_URI',
    'NATS_URL',
    'REDIS_URL',
    'TOKEN_ENCRYPTION_KEY',
    'GETXAPI_API_KEY',
  ] as const;

  for (const key of required) {
    if (!config[key] || typeof config[key] !== 'string') {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  return config;
}
