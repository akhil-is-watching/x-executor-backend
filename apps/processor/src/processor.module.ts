import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { NatsJsModule } from '@app/nats-js';
import { GetxapiModule } from '@app/getxapi';
import { RedisModule } from '@app/redis';
import { LlmModule } from '@app/llm';
import { validateEnv } from './config/validate-env';
import { CryptoModule } from './crypto/crypto.module';
import { DmPipelineService } from './dm/dm-pipeline.service';
import { WebhookConsumerService } from './dm/webhook-consumer.service';
import {
  Organization,
  OrganizationSchema,
} from './schemas/organization.schema';
import {
  XConnection,
  XConnectionSchema,
} from './schemas/x-connection.schema';
import { ProcessorController } from './processor.controller';

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
      { name: Organization.name, schema: OrganizationSchema },
    ]),
    NatsJsModule,
    RedisModule,
    GetxapiModule,
    LlmModule,
    CryptoModule,
  ],
  controllers: [ProcessorController],
  providers: [DmPipelineService, WebhookConsumerService],
})
export class ProcessorModule {}
