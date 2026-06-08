import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Campaign, CampaignSchema } from '../schemas/campaign.schema';
import {
  CampaignJob,
  CampaignJobSchema,
} from '../schemas/campaign-job.schema';
import {
  XConnection,
  XConnectionSchema,
} from '../schemas/x-connection.schema';
import { AccountSelectorService } from './account-selector.service';
import { CampaignConsumerService } from './campaign-consumer.service';
import { JobDispatcherService } from './job-dispatcher.service';
import { JobPlannerService } from './job-planner.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Campaign.name, schema: CampaignSchema },
      { name: CampaignJob.name, schema: CampaignJobSchema },
      { name: XConnection.name, schema: XConnectionSchema },
    ]),
  ],
  providers: [
    AccountSelectorService,
    JobPlannerService,
    CampaignConsumerService,
    JobDispatcherService,
  ],
})
export class CampaignModule {}
