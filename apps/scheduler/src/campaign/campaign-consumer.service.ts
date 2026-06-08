import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import {
  NATS_DURABLE_SCHEDULER_CAMPAIGN,
  NATS_SUBJECT_CAMPAIGN_CREATED,
  NatsJsService,
} from '@app/nats-js';
import type { CampaignCreatedEvent } from '@app/shared';
import { JobPlannerService } from './job-planner.service';

@Injectable()
export class CampaignConsumerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CampaignConsumerService.name);

  constructor(
    private readonly natsJs: NatsJsService,
    private readonly jobPlanner: JobPlannerService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.logger.log(
      `Starting JetStream consumer ${NATS_DURABLE_SCHEDULER_CAMPAIGN} on ${NATS_SUBJECT_CAMPAIGN_CREATED}`,
    );

    await this.natsJs.startJsonConsumer<CampaignCreatedEvent>({
      filterSubject: NATS_SUBJECT_CAMPAIGN_CREATED,
      durable: NATS_DURABLE_SCHEDULER_CAMPAIGN,
      handler: async (event) => {
        this.logger.log(
          `Campaign created event campaignId=${event.campaignId} orgId=${event.orgId} ` +
            `targets=${event.targetUsernames.length}`,
        );
        await this.jobPlanner.planCampaign(event);
      },
    });
  }
}
