import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { NatsJsModule } from '@app/nats-js';
import { validateEnv } from './config/validate-env';
import { IncomingService } from './incoming/incoming.service';
import {
  ConnectionWebhook,
  ConnectionWebhookSchema,
} from './schemas/connection-webhook.schema';
import {
  XConnection,
  XConnectionSchema,
} from './schemas/x-connection.schema';
import { WebhookController } from './webhook.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>('MONGODB_URI'),
      }),
    }),
    NatsJsModule,
    MongooseModule.forFeature([
      { name: ConnectionWebhook.name, schema: ConnectionWebhookSchema },
      { name: XConnection.name, schema: XConnectionSchema },
    ]),
  ],
  controllers: [WebhookController],
  providers: [IncomingService],
})
export class WebhookModule {}
