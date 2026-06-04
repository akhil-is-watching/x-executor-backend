export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const required = [
    'MONGODB_URI',
    'REDIS_URL',
    'JWT_SECRET',
    'TOKEN_ENCRYPTION_KEY',
    'HUB_PUBLIC_BASE_URL',
    'WEBHOOK_PUBLIC_BASE_URL',
    'X_CLIENT_ID',
    'X_CLIENT_SECRET',
    'X_REDIRECT_URI',
  ] as const;

  for (const key of required) {
    if (!config[key] || typeof config[key] !== 'string') {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  const encryptionKey = Buffer.from(
    config.TOKEN_ENCRYPTION_KEY as string,
    'base64',
  );
  if (encryptionKey.length !== 32) {
    throw new Error(
      'TOKEN_ENCRYPTION_KEY must be 32 bytes when base64-decoded',
    );
  }

  return config;
}
