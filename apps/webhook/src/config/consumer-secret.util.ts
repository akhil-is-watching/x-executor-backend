import { ConfigService } from '@nestjs/config';

/**
 * Secret for CRC and POST signature verification.
 * Must be OAuth 1.0 API Key Secret (Consumer Secret) — same value as Hub X_API_KEY_SECRET.
 */
export function trimEnvSecret(value: string): string {
  return value.trim().replace(/^["']|["']$/g, '');
}

export function getXConsumerSecretSource(config: ConfigService): string {
  if (config.get<string>('X_API_KEY_SECRET')?.trim()) return 'X_API_KEY_SECRET';
  if (config.get<string>('X_CONSUMER_SECRET')?.trim()) return 'X_CONSUMER_SECRET';
  return 'X_CLIENT_SECRET';
}

export function getXConsumerSecret(config: ConfigService): string {
  const raw =
    config.get<string>('X_API_KEY_SECRET') ??
    config.get<string>('X_CONSUMER_SECRET') ??
    config.getOrThrow<string>('X_CLIENT_SECRET');
  return trimEnvSecret(raw);
}
