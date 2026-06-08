import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import {
  NATS_DURABLE_SENDER_CAMPAIGN,
  NATS_SUBJECT_CAMPAIGN_DM_READY,
  NatsJsService,
} from '@app/nats-js';
import type { CampaignDmReadyEvent } from '@app/shared';
import { CampaignDmSenderService } from './campaign-dm-sender.service';

@Injectable()
export class CampaignConsumerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CampaignConsumerService.name);

  constructor(
    private readonly natsJs: NatsJsService,
    private readonly campaignDmSender: CampaignDmSenderService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.logger.log(
      `Starting JetStream consumer ${NATS_DURABLE_SENDER_CAMPAIGN} on ${NATS_SUBJECT_CAMPAIGN_DM_READY}`,
    );

    await this.natsJs.startJsonConsumer<CampaignDmReadyEvent>({
      filterSubject: NATS_SUBJECT_CAMPAIGN_DM_READY,
      durable: NATS_DURABLE_SENDER_CAMPAIGN,
      handler: async (event) => {
        this.logger.log(
          `NATS campaign DM ready jobId=${event.jobId} campaignId=${event.campaignId} ` +
            `to=@${event.recipientUsername}`,
        );
        await this.campaignDmSender.handleCampaignDmReady(event);
      },
    });
  }
}
