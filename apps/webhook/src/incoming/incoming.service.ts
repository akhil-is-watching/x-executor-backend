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
  normalizeXWebhookPayload,
  isXActivityWebhookPayload,
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
    rawPayload: Record<string, unknown>,
  ): Promise<ProcessXWebhookResult> {
    const payload = normalizeXWebhookPayload(rawPayload);
    if (this.isXChatWebhook(rawPayload, payload)) {
      this.logXChatWebhookStructure(rawPayload, payload);
    }
    if (isXActivityWebhookPayload(rawPayload)) {
      this.logger.log(
        `Normalized XAA webhook event_type=${String(
          (rawPayload.data as Record<string, unknown>)?.event_type ?? 'unknown',
        )} → for_user_id=${String(payload.for_user_id ?? 'missing')}`,
      );
    }

    const forUserId = payload.for_user_id;
    if (forUserId === undefined || forUserId === null) {
      this.logger.warn(
        `Unrecognized webhook payload shape keys=[${Object.keys(rawPayload).join(', ')}]`,
      );
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

  private isXChatWebhook(
    rawPayload: Record<string, unknown>,
    normalizedPayload: Record<string, unknown>,
  ): boolean {
    if (normalizedPayload.x_chat_events !== undefined) {
      return true;
    }

    if (!isXActivityWebhookPayload(rawPayload)) {
      return false;
    }

    const eventType = String(
      (rawPayload.data as Record<string, unknown>)?.event_type ?? '',
    );
    return eventType.startsWith('chat.');
  }

  private logXChatWebhookStructure(
    rawPayload: Record<string, unknown>,
    normalizedPayload: Record<string, unknown>,
  ): void {
    this.logger.log(
      `[XChat] raw webhook envelope: ${JSON.stringify(rawPayload, null, 2)}`,
    );

    const data = rawPayload.data;
    if (data !== null && typeof data === 'object' && !Array.isArray(data)) {
      const inner = (data as Record<string, unknown>).payload;
      if (inner !== undefined) {
        this.logger.log(
          `[XChat] XAA inner payload: ${JSON.stringify(inner, null, 2)}`,
        );
      }
    }

    this.logger.log(
      `[XChat] normalized payload: ${JSON.stringify(normalizedPayload, null, 2)}`,
    );
  }
}
