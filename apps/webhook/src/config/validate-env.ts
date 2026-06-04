export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const required = [
    'MONGODB_URI',
    'NATS_URL',
    'X_CLIENT_SECRET',
    'WEBHOOK_PUBLIC_BASE_URL',
  ] as const;

  for (const key of required) {
    if (!config[key] || typeof config[key] !== 'string') {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  return config;
}
