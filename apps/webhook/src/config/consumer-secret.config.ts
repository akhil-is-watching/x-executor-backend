import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  getXConsumerSecret,
  getXConsumerSecretSource,
  trimEnvSecret,
} from './consumer-secret.util';

@Injectable()
export class ConsumerSecretConfig implements OnModuleInit {
  private readonly logger = new Logger(ConsumerSecretConfig.name);

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const candidates = [
      ['X_API_KEY_SECRET', this.config.get<string>('X_API_KEY_SECRET')?.trim()],
      ['X_CONSUMER_SECRET', this.config.get<string>('X_CONSUMER_SECRET')?.trim()],
      ['X_CLIENT_SECRET', this.config.get<string>('X_CLIENT_SECRET')?.trim()],
    ]
      .map(([k, v]) => (v ? ([k, trimEnvSecret(v)] as [string, string]) : null))
      .filter((entry): entry is [string, string] => entry !== null);

    const uniqueValues = new Set(candidates.map(([, v]) => v));
    if (candidates.length > 1 && uniqueValues.size > 1) {
      this.logger.warn(
        `Multiple webhook CRC secrets differ (${candidates.map(([k]) => k).join(', ')}). ` +
          `Active: ${getXConsumerSecretSource(this.config)}. On Webhook only: set X_API_KEY_SECRET ` +
          `(same as Hub) and remove X_CLIENT_SECRET (OAuth 2.0).`,
      );
    }

    const source = getXConsumerSecretSource(this.config);
    this.logger.log(
      `CRC/webhook signatures use ${source} (${getXConsumerSecret(this.config).length} chars)`,
    );
  }
}
