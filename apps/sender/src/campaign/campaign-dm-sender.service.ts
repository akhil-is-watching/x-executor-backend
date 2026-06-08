import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { GetxapiService } from '@app/getxapi';
import { NATS_SUBJECT_CAMPAIGN_ANALYTICS, NatsJsService } from '@app/nats-js';
import type {
  CampaignAnalyticsEvent,
  CampaignDmReadyEvent,
} from '@app/shared';
import { TokenCryptoService } from '../crypto/token-crypto.service';
import {
  XConnection,
  XConnectionDocument,
} from '../schemas/x-connection.schema';

@Injectable()
export class CampaignDmSenderService {
  private readonly logger = new Logger(CampaignDmSenderService.name);

  constructor(
    @InjectModel(XConnection.name)
    private readonly connectionModel: Model<XConnectionDocument>,
    private readonly tokenCrypto: TokenCryptoService,
    private readonly getxapi: GetxapiService,
    private readonly natsJs: NatsJsService,
  ) {}

  async handleCampaignDmReady(event: CampaignDmReadyEvent): Promise<void> {
    this.logger.log(
      `Sending campaign DM jobId=${event.jobId} campaignId=${event.campaignId} ` +
        `to=@${event.recipientUsername} via connection=${event.connectionId}`,
    );

    const connection = await this.connectionModel.findOne({
      _id: new Types.ObjectId(event.connectionId),
      orgId: new Types.ObjectId(event.orgId),
      revokedAt: null,
    });

    if (!connection?.authTokenEnc) {
      await this.publishAnalytics(event, {
        type: 'dm_failed',
        error: 'Connection missing or has no auth token',
      });
      return;
    }

    try {
      const authToken = this.tokenCrypto.decrypt(connection.authTokenEnc);
      const result = await this.getxapi.sendDm({
        authToken,
        recipientUsername: event.recipientUsername,
        text: event.messageText,
      });

      this.logger.log(
        `Campaign DM sent jobId=${event.jobId} messageId=${result.data?.id ?? 'unknown'} ` +
          `to=@${event.recipientUsername}`,
      );

      await this.publishAnalytics(event, {
        type: 'dm_sent',
        recipientXUserId: result.data?.recipientId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Campaign DM failed jobId=${event.jobId} to=@${event.recipientUsername}: ${message}`,
      );
      await this.publishAnalytics(event, {
        type: 'dm_failed',
        error: message,
      });
    }
  }

  private async publishAnalytics(
    event: CampaignDmReadyEvent,
    update: Pick<CampaignAnalyticsEvent, 'type' | 'recipientXUserId' | 'error'>,
  ): Promise<void> {
    const analyticsEvent: CampaignAnalyticsEvent = {
      campaignId: event.campaignId,
      orgId: event.orgId,
      jobId: event.jobId,
      type: update.type,
      recipientXUserId: update.recipientXUserId,
      error: update.error,
      occurredAt: new Date().toISOString(),
    };

    await this.natsJs.publishJson(
      NATS_SUBJECT_CAMPAIGN_ANALYTICS,
      analyticsEvent,
    );
  }
}
