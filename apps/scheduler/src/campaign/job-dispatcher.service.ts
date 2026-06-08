import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  NATS_SUBJECT_CAMPAIGN_DM_READY,
  NatsJsService,
} from '@app/nats-js';
import type { CampaignDmReadyEvent } from '@app/shared';
import {
  CampaignJob,
  CampaignJobDocument,
} from '../schemas/campaign-job.schema';

@Injectable()
export class JobDispatcherService {
  private readonly logger = new Logger(JobDispatcherService.name);
  private dispatching = false;

  constructor(
    @InjectModel(CampaignJob.name)
    private readonly campaignJobModel: Model<CampaignJobDocument>,
    private readonly natsJs: NatsJsService,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async dispatchDueJobs(): Promise<void> {
    if (this.dispatching) {
      return;
    }

    this.dispatching = true;
    try {
      const now = new Date();
      const dueJobs = await this.campaignJobModel
        .find({
          status: 'pending',
          scheduledAt: { $lte: now },
        })
        .sort({ scheduledAt: 1 })
        .limit(50);

      if (dueJobs.length === 0) {
        return;
      }

      this.logger.log(`Dispatching ${dueJobs.length} due campaign job(s)`);

      for (const job of dueJobs) {
        const event: CampaignDmReadyEvent = {
          jobId: job._id.toString(),
          campaignId: job.campaignId.toString(),
          orgId: job.orgId.toString(),
          connectionId: job.connectionId.toString(),
          xUserId: job.xUserId,
          recipientUsername: job.recipientUsername,
          messageText: job.messageText,
        };

        await this.natsJs.publishJson(NATS_SUBJECT_CAMPAIGN_DM_READY, event);
        await this.campaignJobModel.updateOne(
          { _id: job._id, status: 'pending' },
          {
            $set: {
              status: 'dispatched',
              dispatchedAt: new Date(),
            },
          },
        );
      }
    } finally {
      this.dispatching = false;
    }
  }
}
