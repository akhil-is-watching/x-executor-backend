import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import {
  NATS_DURABLE_PROCESSOR_WEBHOOK,
  NATS_SUBJECT_WEBHOOK_RECEIVED,
  NatsJsService,
} from '@app/nats-js';
import type { XWebhookReceivedEvent } from '@app/shared';
import { DmPipelineService } from './dm-pipeline.service';

@Injectable()
export class WebhookConsumerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(WebhookConsumerService.name);

  constructor(
    private readonly natsJs: NatsJsService,
    private readonly dmPipeline: DmPipelineService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.logger.log(
      `Starting JetStream consumer ${NATS_DURABLE_PROCESSOR_WEBHOOK} on ${NATS_SUBJECT_WEBHOOK_RECEIVED}`,
    );

    await this.natsJs.startJsonConsumer<XWebhookReceivedEvent>({
      filterSubject: NATS_SUBJECT_WEBHOOK_RECEIVED,
      durable: NATS_DURABLE_PROCESSOR_WEBHOOK,
      handler: async (event) => {
        this.logger.log(
          `NATS webhook event received eventId=${event.eventId} ` +
            `@${event.xUsername} types=[${event.eventTypes.join(', ')}]`,
        );
        await this.dmPipeline.handleWebhookEvent(event);
      },
    });
  }
}
