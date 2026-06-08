import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  NATS_DURABLE_ANALYTICS_CAMPAIGN,
  NATS_SUBJECT_CAMPAIGN_ANALYTICS,
  NatsJsService,
} from '@app/nats-js';
import type { CampaignAnalyticsEvent } from '@app/shared';
import { Campaign, CampaignDocument } from '../schemas/campaign.schema';
import {
  CampaignJob,
  CampaignJobDocument,
} from '../schemas/campaign-job.schema';

@Injectable()
export class AnalyticsConsumerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AnalyticsConsumerService.name);

  constructor(
    @InjectModel(Campaign.name)
    private readonly campaignModel: Model<CampaignDocument>,
    @InjectModel(CampaignJob.name)
    private readonly campaignJobModel: Model<CampaignJobDocument>,
    private readonly natsJs: NatsJsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.logger.log(
      `Starting JetStream consumer ${NATS_DURABLE_ANALYTICS_CAMPAIGN} on ${NATS_SUBJECT_CAMPAIGN_ANALYTICS}`,
    );

    await this.natsJs.startJsonConsumer<CampaignAnalyticsEvent>({
      filterSubject: NATS_SUBJECT_CAMPAIGN_ANALYTICS,
      durable: NATS_DURABLE_ANALYTICS_CAMPAIGN,
      handler: async (event) => {
        this.logger.log(
          `Campaign analytics campaignId=${event.campaignId} jobId=${event.jobId} type=${event.type}`,
        );
        await this.handleAnalyticsEvent(event);
      },
    });
  }

  async handleAnalyticsEvent(event: CampaignAnalyticsEvent): Promise<void> {
    switch (event.type) {
      case 'dm_sent':
        await this.handleDmSent(event);
        break;
      case 'dm_failed':
        await this.handleDmFailed(event);
        break;
      case 'reply_received':
        await this.handleReplyReceived(event);
        break;
      default:
        this.logger.warn(`Unknown analytics event type for job ${event.jobId}`);
    }

    await this.refreshCampaignProgress(event.campaignId);
  }

  private async handleDmSent(event: CampaignAnalyticsEvent): Promise<void> {
    await this.campaignJobModel.updateOne(
      { _id: new Types.ObjectId(event.jobId) },
      {
        $set: {
          status: 'sent',
          sentAt: new Date(event.occurredAt),
          recipientXUserId: event.recipientXUserId,
        },
      },
    );

    await this.campaignModel.updateOne(
      { _id: new Types.ObjectId(event.campaignId) },
      { $inc: { messagesSent: 1 } },
    );
  }

  private async handleDmFailed(event: CampaignAnalyticsEvent): Promise<void> {
    await this.campaignJobModel.updateOne(
      { _id: new Types.ObjectId(event.jobId) },
      {
        $set: {
          status: 'failed',
          failedAt: new Date(event.occurredAt),
          error: event.error,
        },
      },
    );

    await this.campaignModel.updateOne(
      { _id: new Types.ObjectId(event.campaignId) },
      { $inc: { failedCount: 1 } },
    );
  }

  private async handleReplyReceived(
    event: CampaignAnalyticsEvent,
  ): Promise<void> {
    const updated = await this.campaignJobModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(event.jobId),
        replyReceived: { $ne: true },
      },
      { $set: { replyReceived: true } },
      { returnDocument: 'after' },
    );

    if (!updated) {
      return;
    }

    await this.campaignModel.updateOne(
      { _id: new Types.ObjectId(event.campaignId) },
      { $inc: { repliesReceived: 1 } },
    );
  }

  private async refreshCampaignProgress(campaignId: string): Promise<void> {
    const campaign = await this.campaignModel.findById(campaignId);
    if (!campaign) {
      return;
    }

    const processed = campaign.messagesSent + campaign.failedCount;
    const remaining = Math.max(campaign.totalTargets - processed, 0);
    const now = new Date();
    const expectedEndAt = await this.calculateExpectedEndAt(
      campaign,
      remaining,
      now,
    );

    const update: Partial<Campaign> = { expectedEndAt };

    if (remaining === 0 && campaign.status === 'running') {
      update.status = 'completed';
      update.completedAt = now;
    }

    await this.campaignModel.updateOne(
      { _id: campaign._id },
      { $set: update },
    );
  }

  private async calculateExpectedEndAt(
    campaign: CampaignDocument,
    remaining: number,
    now: Date,
  ): Promise<Date | undefined> {
    if (remaining <= 0) {
      return now;
    }

    if (campaign.startedAt) {
      const elapsedMs = Math.max(now.getTime() - campaign.startedAt.getTime(), 1);
      const processed = campaign.messagesSent + campaign.failedCount;
      if (processed > 0) {
        const ratePerMs = processed / elapsedMs;
        return new Date(now.getTime() + remaining / ratePerMs);
      }
    }

    const lastPendingJob = await this.campaignJobModel
      .findOne({
        campaignId: campaign._id,
        status: { $in: ['pending', 'dispatched'] },
      })
      .sort({ scheduledAt: -1 })
      .select('scheduledAt');

    return lastPendingJob?.scheduledAt ?? campaign.expectedEndAt;
  }
}
