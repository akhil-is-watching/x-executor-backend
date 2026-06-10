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
import { CreateCampaignDto } from './dto/create-campaign.dto';

const UNTITLED_CAMPAIGN_NAME = 'Untitled campaign';

@Injectable()
export class CampaignsService {
  constructor(
    @InjectModel(Campaign.name)
    private readonly campaignModel: Model<CampaignDocument>,
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

    const campaign = await this.campaignModel.create({
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
    });

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

  async getStatus(orgId: string, campaignId: string) {
    const campaign = await this.campaignModel.findOne({
      _id: new Types.ObjectId(campaignId),
      orgId: new Types.ObjectId(orgId),
    });

    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }

    const remaining =
      campaign.totalTargets - campaign.messagesSent - campaign.failedCount;
    const progressPercent =
      campaign.totalTargets > 0
        ? Math.round(
            ((campaign.messagesSent + campaign.failedCount) /
              campaign.totalTargets) *
              100,
          )
        : 0;

    return {
      id: campaign._id.toString(),
      orgId: campaign.orgId.toString(),
      name: this.resolveName(campaign),
      status: campaign.status,
      messageText: campaign.messageText,
      targetUsernames: campaign.targetUsernames,
      totalTargets: campaign.totalTargets,
      dmsPerHour: campaign.dmsPerHour,
      messagesScheduled: campaign.messagesScheduled,
      messagesSent: campaign.messagesSent,
      repliesReceived: campaign.repliesReceived,
      failedCount: campaign.failedCount,
      remaining,
      progressPercent,
      startedAt: campaign.startedAt,
      expectedEndAt: campaign.expectedEndAt,
      completedAt: campaign.completedAt,
      createdAt: campaign.createdAt,
      updatedAt: campaign.updatedAt,
    };
  }

  private toSummary(campaign: CampaignDocument) {
    const progressPercent =
      campaign.totalTargets > 0
        ? Math.round(
            ((campaign.messagesSent + campaign.failedCount) /
              campaign.totalTargets) *
              100,
          )
        : 0;

    return {
      id: campaign._id.toString(),
      name: this.resolveName(campaign),
      status: campaign.status,
      totalTargets: campaign.totalTargets,
      messagesSent: campaign.messagesSent,
      failedCount: campaign.failedCount,
      progressPercent,
      createdAt: campaign.createdAt,
      completedAt: campaign.completedAt,
    };
  }

  private resolveName(campaign: CampaignDocument): string {
    const trimmed = campaign.name?.trim();
    return trimmed ? trimmed : UNTITLED_CAMPAIGN_NAME;
  }
}
