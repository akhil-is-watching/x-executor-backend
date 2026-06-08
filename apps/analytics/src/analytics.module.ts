import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { NatsJsModule } from '@app/nats-js';
import { validateEnv } from './config/validate-env';
import { Campaign, CampaignSchema } from './schemas/campaign.schema';
import {
  CampaignJob,
  CampaignJobSchema,
} from './schemas/campaign-job.schema';
import { AnalyticsConsumerService } from './campaign/analytics-consumer.service';
import { AnalyticsController } from './analytics.controller';

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
      { name: Campaign.name, schema: CampaignSchema },
      { name: CampaignJob.name, schema: CampaignJobSchema },
    ]),
    NatsJsModule,
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsConsumerService],
})
export class AnalyticsModule {}
