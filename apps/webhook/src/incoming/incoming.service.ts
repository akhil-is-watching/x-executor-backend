import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomUUID } from 'crypto';
import { NatsJsService, NATS_SUBJECT_WEBHOOK_RECEIVED } from '@app/nats-js';
import {
  extractXWebhookEventTypes,
  type XWebhookReceivedEvent,
} from '@app/shared';
import {
  XConnection,
  XConnectionDocument,
} from '../schemas/x-connection.schema';

export const SHARED_WEBHOOK_ID = 'app';

export interface ProcessXWebhookResult {
  eventIds: string[];
}

@Injectable()
export class IncomingService {
  private readonly logger = new Logger(IncomingService.name);

  constructor(
    @InjectModel(XConnection.name)
    private readonly connectionModel: Model<XConnectionDocument>,
    private readonly natsJs: NatsJsService,
  ) {}

  async processIncomingPayload(
    payload: Record<string, unknown>,
  ): Promise<ProcessXWebhookResult> {
    const forUserId = payload.for_user_id;
    if (forUserId === undefined || forUserId === null) {
      throw new BadRequestException('Missing for_user_id in webhook payload');
    }

    const connections = await this.connectionModel.find({
      xUserId: String(forUserId),
      revokedAt: null,
    });

    if (connections.length === 0) {
      this.logger.warn(
        `No active connection for for_user_id=${String(forUserId)} — ` +
          `re-OAuth after deploy; Webhook MONGODB_URI must match Hub`,
      );
      throw new NotFoundException(
        `No active connection for X user ${String(forUserId)}`,
      );
    }

    const eventIds: string[] = [];
    const receivedAt = new Date().toISOString();
    const eventTypes = extractXWebhookEventTypes(payload);

    for (const connection of connections) {
      const event: XWebhookReceivedEvent = {
        eventId: randomUUID(),
        receivedAt,
        orgId: connection.orgId.toString(),
        connectionId: connection._id.toString(),
        webhookId: SHARED_WEBHOOK_ID,
        xUserId: connection.xUserId,
        xUsername: connection.xUsername,
        eventTypes,
        payload,
      };
      await this.natsJs.publishJson(NATS_SUBJECT_WEBHOOK_RECEIVED, event);
      this.logger.log(
        `Published ${NATS_SUBJECT_WEBHOOK_RECEIVED} eventId=${event.eventId} ` +
          `orgId=${event.orgId} types=[${eventTypes.join(', ')}]`,
      );
      eventIds.push(event.eventId);
    }

    return { eventIds };
  }
}
