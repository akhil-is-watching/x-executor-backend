import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import {
  NATS_DURABLE_SENDER_HANDOFF,
  NATS_SUBJECT_DM_HANDOFF_NOTIFY,
  NatsJsService,
} from '@app/nats-js';
import type { XDmHandoffNotifyEvent } from '@app/shared';
import { HandoffNotifySenderService } from './handoff-notify-sender.service';

@Injectable()
export class HandoffNotifyConsumerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(HandoffNotifyConsumerService.name);

  constructor(
    private readonly natsJs: NatsJsService,
    private readonly handoffNotifySender: HandoffNotifySenderService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.logger.log(
      `Starting JetStream consumer ${NATS_DURABLE_SENDER_HANDOFF} on ${NATS_SUBJECT_DM_HANDOFF_NOTIFY}`,
    );

    await this.natsJs.startJsonConsumer<XDmHandoffNotifyEvent>({
      filterSubject: NATS_SUBJECT_DM_HANDOFF_NOTIFY,
      durable: NATS_DURABLE_SENDER_HANDOFF,
      handler: async (event) => {
        await this.handoffNotifySender.handleHandoffNotify(event);
      },
    });
  }
}
