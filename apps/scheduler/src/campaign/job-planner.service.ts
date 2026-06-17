import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { CampaignCreatedEvent } from '@app/shared';
import { Campaign, CampaignDocument } from '../schemas/campaign.schema';
import {
  CampaignJob,
  CampaignJobDocument,
} from '../schemas/campaign-job.schema';
import {
  XConnection,
  XConnectionDocument,
} from '../schemas/x-connection.schema';
import { AccountSelectorService } from './account-selector.service';

@Injectable()
export class JobPlannerService {
  private readonly logger = new Logger(JobPlannerService.name);

  constructor(
    @InjectModel(Campaign.name)
    private readonly campaignModel: Model<CampaignDocument>,
    @InjectModel(CampaignJob.name)
    private readonly campaignJobModel: Model<CampaignJobDocument>,
    @InjectModel(XConnection.name)
    private readonly connectionModel: Model<XConnectionDocument>,
    private readonly accountSelector: AccountSelectorService,
  ) {}

  async planCampaign(event: CampaignCreatedEvent): Promise<void> {
    const campaign = await this.campaignModel.findOne({
      _id: new Types.ObjectId(event.campaignId),
      orgId: new Types.ObjectId(event.orgId),
    });

    if (!campaign) {
      this.logger.warn(`Campaign ${event.campaignId} not found; skipping plan`);
      return;
    }

    if (campaign.status !== 'pending') {
      this.logger.log(
        `Campaign ${event.campaignId} already ${campaign.status}; skipping plan`,
      );
      return;
    }

    const connections = await this.connectionModel.find({
      orgId: new Types.ObjectId(event.orgId),
      revokedAt: null,
      authTokenEnc: { $exists: true, $nin: [null, ''] },
    });

    if (connections.length === 0) {
      await this.campaignModel.updateOne(
        { _id: campaign._id },
        {
          $set: {
            status: 'failed',
            completedAt: new Date(),
          },
        },
      );
      this.logger.error(
        `Campaign ${event.campaignId} failed: no connected accounts with auth tokens`,
      );
      return;
    }

    const allAccounts = connections.map((connection) => ({
      connectionId: connection._id.toString(),
      xUserId: connection.xUserId,
    }));

    let accounts: typeof allAccounts;

    if (campaign.connectionIds?.length) {
      const selectedIds = campaign.connectionIds.map((id) => id.toString());
      const accountsById = new Map(
        allAccounts.map((account) => [account.connectionId, account]),
      );
      accounts = selectedIds
        .map((connectionId) => accountsById.get(connectionId))
        .filter((account): account is (typeof allAccounts)[number] => !!account);

      if (accounts.length === 0) {
        await this.campaignModel.updateOne(
          { _id: campaign._id },
          {
            $set: {
              status: 'failed',
              completedAt: new Date(),
            },
          },
        );
        this.logger.error(
          `Campaign ${event.campaignId} failed: selected accounts unavailable`,
        );
        return;
      }

      if (accounts.length < selectedIds.length) {
        this.logger.warn(
          `Campaign ${event.campaignId} requested ${selectedIds.length} selected account(s) ` +
            `but only ${accounts.length} remain eligible; using ${accounts.length}`,
        );
      }
    } else {
      const requestedCount = campaign.accountsToUse ?? connections.length;
      const effectiveLimit = Math.min(requestedCount, connections.length);

      if (effectiveLimit < requestedCount) {
        this.logger.warn(
          `Campaign ${event.campaignId} requested ${requestedCount} account(s) but only ${connections.length} eligible; using ${effectiveLimit}`,
        );
      }

      accounts = await this.accountSelector.pickLeastLoadedAccounts(
        allAccounts,
        effectiveLimit,
      );
    }

    if (accounts.length === 0) {
      await this.campaignModel.updateOne(
        { _id: campaign._id },
        {
          $set: {
            status: 'failed',
            completedAt: new Date(),
          },
        },
      );
      this.logger.error(
        `Campaign ${event.campaignId} failed: no accounts available after selection`,
      );
      return;
    }

    const plannedJobs = await this.accountSelector.planJobs(
      accounts,
      event.targetUsernames,
      {
        campaignId: event.campaignId,
        orgId: event.orgId,
        messageText: event.messageText,
        hourlyLimitOverride: campaign.dmsPerHour ?? event.dmsPerHour ?? 15,
      },
    );

    await this.campaignJobModel.insertMany(
      plannedJobs.map((job) => ({
        campaignId: new Types.ObjectId(job.campaignId),
        orgId: new Types.ObjectId(job.orgId),
        connectionId: new Types.ObjectId(job.connectionId),
        xUserId: job.xUserId,
        recipientUsername: job.recipientUsername,
        messageText: job.messageText,
        status: 'pending',
        scheduledAt: job.scheduledAt,
      })),
    );

    const expectedEndAt = plannedJobs.reduce(
      (latest, job) =>
        job.scheduledAt > latest ? job.scheduledAt : latest,
      plannedJobs[0]?.scheduledAt ?? new Date(),
    );

    await this.campaignModel.updateOne(
      { _id: campaign._id },
      {
        $set: {
          status: 'running',
          messagesScheduled: plannedJobs.length,
          startedAt: new Date(),
          expectedEndAt,
        },
      },
    );

    this.logger.log(
      `Planned ${plannedJobs.length} jobs for campaign ${event.campaignId} ` +
        `using ${accounts.length} of ${connections.length} eligible account(s)` +
        (campaign.connectionIds?.length
          ? ` (explicit selection)`
          : ` (requested=${campaign.accountsToUse ?? connections.length})`) +
        `; expectedEndAt=${expectedEndAt.toISOString()}`,
    );
  }
}
