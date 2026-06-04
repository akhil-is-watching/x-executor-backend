import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getXConsumerSecret } from './consumer-secret.util';

function secretSource(config: ConfigService): string {
  if (config.get<string>('X_CONSUMER_SECRET')?.trim()) return 'X_CONSUMER_SECRET';
  if (config.get<string>('X_API_KEY_SECRET')?.trim()) return 'X_API_KEY_SECRET';
  return 'X_CLIENT_SECRET';
}

@Injectable()
export class ConsumerSecretConfig implements OnModuleInit {
  private readonly logger = new Logger(ConsumerSecretConfig.name);

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const candidates = [
      ['X_CONSUMER_SECRET', this.config.get<string>('X_CONSUMER_SECRET')?.trim()],
      ['X_API_KEY_SECRET', this.config.get<string>('X_API_KEY_SECRET')?.trim()],
      ['X_CLIENT_SECRET', this.config.get<string>('X_CLIENT_SECRET')?.trim()],
    ].filter((entry): entry is [string, string] => Boolean(entry[1]));

    const uniqueValues = new Set(candidates.map(([, v]) => v));
    if (candidates.length > 1 && uniqueValues.size > 1) {
      this.logger.warn(
        `Multiple webhook CRC secrets differ (${candidates.map(([k]) => k).join(', ')}). ` +
          `Active: ${secretSource(this.config)}. On the Webhook service only, unset X_CLIENT_SECRET ` +
          `(OAuth 2.0) — use X_CONSUMER_SECRET or X_API_KEY_SECRET (= OAuth 1.0 Consumer Secret).`,
      );
    }

    const source = secretSource(this.config);
    this.logger.log(
      `CRC/webhook signatures use ${source} (${getXConsumerSecret(this.config).length} chars)`,
    );
  }
}
