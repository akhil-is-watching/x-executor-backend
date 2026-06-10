import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { NatsJsModule } from '@app/nats-js';
import { GetxapiModule } from '@app/getxapi';
import { RedisModule } from '@app/redis';
import { validateEnv } from './config/validate-env';
import { CryptoModule } from './crypto/crypto.module';
import { DmSenderService } from './dm/dm-sender.service';
import { ReplyConsumerService } from './dm/reply-consumer.service';
import { CampaignConsumerService } from './campaign/campaign-consumer.service';
import { CampaignDmSenderService } from './campaign/campaign-dm-sender.service';
import {
  XConnection,
  XConnectionSchema,
} from './schemas/x-connection.schema';
import { DmMessage, DmMessageSchema } from './schemas/dm-message.schema';
import { SenderController } from './sender.controller';

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
    MongooseModule.forFeature([
      { name: XConnection.name, schema: XConnectionSchema },
      { name: DmMessage.name, schema: DmMessageSchema },
    ]),
    NatsJsModule,
    RedisModule,
    GetxapiModule,
    CryptoModule,
  ],
  controllers: [SenderController],
  providers: [
    DmSenderService,
    ReplyConsumerService,
    CampaignDmSenderService,
    CampaignConsumerService,
  ],
})
export class SenderModule {}
