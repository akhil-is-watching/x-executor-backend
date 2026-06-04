import { ConfigService } from '@nestjs/config';

/**
 * Secret for CRC and POST signature verification.
 * X expects the app's API Key Secret (Consumer Secret), not the OAuth bearer token.
 * Use X_CONSUMER_SECRET when it differs from OAuth 2.0 Client Secret.
 */
export function getXConsumerSecret(config: ConfigService): string {
  const raw =
    config.get<string>('X_CONSUMER_SECRET') ??
    config.getOrThrow<string>('X_CLIENT_SECRET');
  return raw.trim();
}
