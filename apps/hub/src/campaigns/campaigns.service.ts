import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { NATS_SUBJECT_CAMPAIGN_CREATED, NatsJsService } from '@app/nats-js';
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
import { CreateCampaignDto } from './dto/create-campaign.dto';

const UNTITLED_CAMPAIGN_NAME = 'Untitled campaign';

@Injectable()
export class CampaignsService {
  constructor(
    @InjectModel(Campaign.name)
    private readonly campaignModel: Model<CampaignDocument>,
    @InjectModel(CampaignJob.name)
    private readonly campaignJobModel: Model<CampaignJobDocument>,
    @InjectModel(XConnection.name)
    private readonly connectionModel: Model<XConnectionDocument>,
    private readonly natsJs: NatsJsService,
  ) {}

  async create(orgId: string, dto: CreateCampaignDto) {
    const targetUsernames = [
      ...new Set(
        dto.targetUsernames
          .map((u) => u.trim().replace(/^@/, '').toLowerCase())
          .filter(Boolean),
      ),
    ];

    if (targetUsernames.length === 0) {
      throw new BadRequestException('At least one valid target username is required');
    }

    const eligibleAccountCount = await this.countEligibleAccounts(orgId);
    if (eligibleAccountCount === 0) {
      throw new BadRequestException(
        'At least one connected account with an auth token is required',
      );
    }

    if (
      dto.accountsToUse !== undefined &&
      dto.accountsToUse > eligibleAccountCount
    ) {
      throw new BadRequestException(
        `accountsToUse cannot exceed ${eligibleAccountCount} eligible connected account(s)`,
      );
    }

    const campaignPayload: Record<string, unknown> = {
      orgId: new Types.ObjectId(orgId),
      name: dto.name.trim(),
      status: 'pending',
      messageText: dto.messageText.trim(),
      targetUsernames,
      totalTargets: targetUsernames.length,
      dmsPerHour: dto.dmsPerHour ?? 15,
      messagesSent: 0,
      messagesScheduled: 0,
      repliesReceived: 0,
      failedCount: 0,
      cancelledCount: 0,
    };

    if (dto.accountsToUse !== undefined) {
      campaignPayload.accountsToUse = dto.accountsToUse;
    }

    const campaign = await this.campaignModel.create(campaignPayload);

    const event: CampaignCreatedEvent = {
      campaignId: campaign._id.toString(),
      orgId,
      targetUsernames,
      messageText: campaign.messageText,
      createdAt: campaign.createdAt.toISOString(),
      dmsPerHour: campaign.dmsPerHour,
    };

    await this.natsJs.publishJson(NATS_SUBJECT_CAMPAIGN_CREATED, event);

    return {
      id: campaign._id.toString(),
      name: campaign.name,
      status: campaign.status,
      totalTargets: campaign.totalTargets,
      dmsPerHour: campaign.dmsPerHour,
      accountsToUse: campaign.accountsToUse,
      messageText: campaign.messageText,
      targetUsernames: campaign.targetUsernames,
      createdAt: campaign.createdAt,
    };
  }

  async listForOrg(orgId: string) {
    const campaigns = await this.campaignModel
      .find({ orgId: new Types.ObjectId(orgId) })
      .sort({ createdAt: -1 });

    return campaigns.map((campaign) => this.toSummary(campaign));
  }

  async updateName(orgId: string, campaignId: string, name: string) {
    const campaign = await this.campaignModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(campaignId),
        orgId: new Types.ObjectId(orgId),
      },
      { $set: { name: name.trim() } },
      { returnDocument: 'after' },
    );

    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }

    return {
      id: campaign._id.toString(),
      name: campaign.name,
      updatedAt: campaign.updatedAt,
    };
  }

  async pause(orgId: string, campaignId: string) {
    const campaign = await this.findCampaignOrThrow(orgId, campaignId);

    if (campaign.status !== 'running') {
      throw new BadRequestException(
        `Cannot pause campaign with status "${campaign.status}"`,
      );
    }

    const updated = await this.campaignModel.findOneAndUpdate(
      {
        _id: campaign._id,
        orgId: campaign.orgId,
        status: 'running',
      },
      { $set: { status: 'paused' } },
      { returnDocument: 'after' },
    );

    if (!updated) {
      throw new BadRequestException(
        `Cannot pause campaign with status "${campaign.status}"`,
      );
    }

    return this.toControlResponse(updated);
  }

  async resume(orgId: string, campaignId: string) {
    const campaign = await this.findCampaignOrThrow(orgId, campaignId);

    if (campaign.status !== 'paused') {
      throw new BadRequestException(
        `Cannot resume campaign with status "${campaign.status}"`,
      );
    }

    const updated = await this.campaignModel.findOneAndUpdate(
      {
        _id: campaign._id,
        orgId: campaign.orgId,
        status: 'paused',
      },
      { $set: { status: 'running' } },
      { returnDocument: 'after' },
    );

    if (!updated) {
      throw new BadRequestException(
        `Cannot resume campaign with status "${campaign.status}"`,
      );
    }

    return this.toControlResponse(updated);
  }

  async stop(orgId: string, campaignId: string) {
    const campaign = await this.findCampaignOrThrow(orgId, campaignId);

    if (!['pending', 'running', 'paused'].includes(campaign.status)) {
      throw new BadRequestException(
        `Cannot stop campaign with status "${campaign.status}"`,
      );
    }

    const now = new Date();
    const cancelResult = await this.campaignJobModel.updateMany(
      {
        campaignId: campaign._id,
        status: 'pending',
      },
      { $set: { status: 'cancelled' } },
    );

    const updated = await this.campaignModel.findOneAndUpdate(
      {
        _id: campaign._id,
        orgId: campaign.orgId,
      },
      {
        $set: {
          status: 'stopped',
          completedAt: now,
          stoppedAt: now,
        },
        $inc: { cancelledCount: cancelResult.modifiedCount },
      },
      { returnDocument: 'after' },
    );

    if (!updated) {
      throw new NotFoundException('Campaign not found');
    }

    return this.toControlResponse(updated);
  }

  async getStatus(orgId: string, campaignId: string) {
    const campaign = await this.findCampaignOrThrow(orgId, campaignId);

    const remaining = this.calculateRemaining(campaign);
    const progressPercent = this.calculateProgressPercent(campaign);

    return {
      id: campaign._id.toString(),
      orgId: campaign.orgId.toString(),
      name: this.resolveName(campaign),
      status: campaign.status,
      messageText: campaign.messageText,
      targetUsernames: campaign.targetUsernames,
      totalTargets: campaign.totalTargets,
      dmsPerHour: campaign.dmsPerHour,
      accountsToUse: campaign.accountsToUse,
      messagesScheduled: campaign.messagesScheduled,
      messagesSent: campaign.messagesSent,
      repliesReceived: campaign.repliesReceived,
      failedCount: campaign.failedCount,
      cancelledCount: campaign.cancelledCount ?? 0,
      remaining,
      progressPercent,
      startedAt: campaign.startedAt,
      expectedEndAt: campaign.expectedEndAt,
      completedAt: campaign.completedAt,
      stoppedAt: campaign.stoppedAt,
      createdAt: campaign.createdAt,
      updatedAt: campaign.updatedAt,
    };
  }

  private async countEligibleAccounts(orgId: string): Promise<number> {
    return this.connectionModel.countDocuments({
      orgId: new Types.ObjectId(orgId),
      revokedAt: null,
      authTokenEnc: { $exists: true, $nin: [null, ''] },
    });
  }

  private async findCampaignOrThrow(
    orgId: string,
    campaignId: string,
  ): Promise<CampaignDocument> {
    const campaign = await this.campaignModel.findOne({
      _id: new Types.ObjectId(campaignId),
      orgId: new Types.ObjectId(orgId),
    });

    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }

    return campaign;
  }

  private toControlResponse(campaign: CampaignDocument) {
    return {
      id: campaign._id.toString(),
      status: campaign.status,
      cancelledCount: campaign.cancelledCount ?? 0,
      completedAt: campaign.completedAt,
      stoppedAt: campaign.stoppedAt,
      updatedAt: campaign.updatedAt,
    };
  }

  private calculateRemaining(campaign: CampaignDocument): number {
    const processed =
      campaign.messagesSent +
      campaign.failedCount +
      (campaign.cancelledCount ?? 0);
    return Math.max(campaign.totalTargets - processed, 0);
  }

  private calculateProgressPercent(campaign: CampaignDocument): number {
    if (campaign.totalTargets <= 0) {
      return 0;
    }

    const processed =
      campaign.messagesSent +
      campaign.failedCount +
      (campaign.cancelledCount ?? 0);

    return Math.round((processed / campaign.totalTargets) * 100);
  }

  private toSummary(campaign: CampaignDocument) {
    return {
      id: campaign._id.toString(),
      name: this.resolveName(campaign),
      status: campaign.status,
      totalTargets: campaign.totalTargets,
      messagesSent: campaign.messagesSent,
      failedCount: campaign.failedCount,
      progressPercent: this.calculateProgressPercent(campaign),
      createdAt: campaign.createdAt,
      completedAt: campaign.completedAt,
    };
  }

  private resolveName(campaign: CampaignDocument): string {
    const trimmed = campaign.name?.trim();
    return trimmed ? trimmed : UNTITLED_CAMPAIGN_NAME;
  }
}
