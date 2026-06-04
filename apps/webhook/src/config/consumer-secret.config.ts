import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getXConsumerSecret } from './consumer-secret.util';

@Injectable()
export class ConsumerSecretConfig implements OnModuleInit {
  private readonly logger = new Logger(ConsumerSecretConfig.name);

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const consumer = this.config.get<string>('X_CONSUMER_SECRET')?.trim();
    const client = this.config.get<string>('X_CLIENT_SECRET')?.trim();

    if (consumer && client && consumer !== client) {
      this.logger.warn(
        'X_CONSUMER_SECRET and X_CLIENT_SECRET are both set and differ — CRC uses X_CONSUMER_SECRET only. ' +
          'If X console CRC fails, remove the wrong one on this Webhook service (keep OAuth 1.0 Consumer Secret).',
      );
    }

    const source = consumer ? 'X_CONSUMER_SECRET' : 'X_CLIENT_SECRET';
    this.logger.log(`CRC/webhook signatures use ${source} (${getXConsumerSecret(this.config).length} chars)`);
  }
}
