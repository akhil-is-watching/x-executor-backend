import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import {
  NATS_DURABLE_SENDER_DM_REPLY,
  NATS_SUBJECT_DM_REPLY_READY,
  NatsJsService,
} from '@app/nats-js';
import type { XDmReplyReadyEvent } from '@app/shared';
import { DmSenderService } from './dm-sender.service';

@Injectable()
export class ReplyConsumerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ReplyConsumerService.name);

  constructor(
    private readonly natsJs: NatsJsService,
    private readonly dmSender: DmSenderService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.logger.log(
      `Starting JetStream consumer ${NATS_DURABLE_SENDER_DM_REPLY} on ${NATS_SUBJECT_DM_REPLY_READY}`,
    );

    await this.natsJs.startJsonConsumer<XDmReplyReadyEvent>({
      filterSubject: NATS_SUBJECT_DM_REPLY_READY,
      durable: NATS_DURABLE_SENDER_DM_REPLY,
      handler: async (event) => {
        this.logger.log(
          `NATS DM reply ready eventId=${event.eventId} ` +
            `sourceEventId=${event.sourceEventId} @${event.xUsername}`,
        );
        await this.dmSender.handleReplyReady(event);
      },
    });
  }
}
