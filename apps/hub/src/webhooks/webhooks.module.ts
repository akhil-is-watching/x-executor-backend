import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WebhooksService } from './webhooks.service';
import {
  ConnectionWebhook,
  ConnectionWebhookSchema,
} from '../schemas/connection-webhook.schema';
import { CryptoModule } from '../crypto/crypto.module';

@Module({
  imports: [
    CryptoModule,
    MongooseModule.forFeature([
      { name: ConnectionWebhook.name, schema: ConnectionWebhookSchema },
    ]),
  ],
  providers: [WebhooksService],
  exports: [WebhooksService],
})
export class WebhooksModule {}
