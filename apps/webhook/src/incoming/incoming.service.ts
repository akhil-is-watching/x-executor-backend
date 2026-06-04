import {
  ForbiddenException,
  Injectable,
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
  ConnectionWebhook,
  ConnectionWebhookDocument,
} from '../schemas/connection-webhook.schema';
import {
  XConnection,
  XConnectionDocument,
} from '../schemas/x-connection.schema';

export interface ProcessXWebhookResult {
  eventId: string;
}

@Injectable()
export class IncomingService {
  constructor(
    @InjectModel(ConnectionWebhook.name)
    private readonly webhookModel: Model<ConnectionWebhookDocument>,
    @InjectModel(XConnection.name)
    private readonly connectionModel: Model<XConnectionDocument>,
    private readonly natsJs: NatsJsService,
  ) {}

  async assertActiveWebhook(
    webhookId: string,
  ): Promise<ConnectionWebhookDocument> {
    const webhook = await this.webhookModel.findOne({
      webhookId,
      active: true,
      revokedAt: null,
    });
    if (!webhook) {
      throw new NotFoundException('Webhook not found');
    }
    return webhook;
  }

  async processXWebhook(
    webhookId: string,
    payload: Record<string, unknown>,
  ): Promise<ProcessXWebhookResult> {
    const webhook = await this.assertActiveWebhook(webhookId);

    const connection = await this.connectionModel.findOne({
      _id: webhook.connectionId,
      revokedAt: null,
    });
    if (!connection) {
      throw new NotFoundException('Connection not found');
    }

    const forUserId = payload.for_user_id;
    if (
      forUserId !== undefined &&
      String(forUserId) !== connection.xUserId
    ) {
      throw new ForbiddenException('for_user_id does not match connection');
    }

    const event: XWebhookReceivedEvent = {
      eventId: randomUUID(),
      receivedAt: new Date().toISOString(),
      orgId: webhook.orgId.toString(),
      connectionId: webhook.connectionId.toString(),
      webhookId: webhook.webhookId,
      xUserId: connection.xUserId,
      xUsername: connection.xUsername,
      eventTypes: extractXWebhookEventTypes(payload),
      payload,
    };

    await this.natsJs.publishJson(NATS_SUBJECT_WEBHOOK_RECEIVED, event);

    return { eventId: event.eventId };
  }
}
