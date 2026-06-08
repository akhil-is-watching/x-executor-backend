import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { NatsJsModule } from '@app/nats-js';
import { validateEnv } from './config/validate-env';
import { CampaignModule } from './campaign/campaign.module';
import { SchedulerController } from './scheduler.controller';

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
    ScheduleModule.forRoot(),
    NatsJsModule,
    CampaignModule,
  ],
  controllers: [SchedulerController],
})
export class SchedulerModule {}
