import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomUUID } from 'crypto';
import { NATS_SUBJECT_DM_REPLY_READY, NatsJsService } from '@app/nats-js';
import { GetxapiService } from '@app/getxapi';
import { LlmService } from '@app/llm';
import {
  isDirectMessageWebhook,
  parseInboundDmFromWebhook,
  type XDmReplyReadyEvent,
  type XWebhookReceivedEvent,
} from '@app/shared';
import { TokenCryptoService } from '../crypto/token-crypto.service';
import {
  Organization,
  OrganizationDocument,
} from '../schemas/organization.schema';
import {
  XConnection,
  XConnectionDocument,
} from '../schemas/x-connection.schema';

@Injectable()
export class DmPipelineService {
  private readonly logger = new Logger(DmPipelineService.name);

  constructor(
    @InjectModel(XConnection.name)
    private readonly connectionModel: Model<XConnectionDocument>,
    @InjectModel(Organization.name)
    private readonly orgModel: Model<OrganizationDocument>,
    private readonly tokenCrypto: TokenCryptoService,
    private readonly getxapi: GetxapiService,
    private readonly llm: LlmService,
    private readonly natsJs: NatsJsService,
    private readonly config: ConfigService,
  ) {}

  async handleWebhookEvent(event: XWebhookReceivedEvent): Promise<void> {
    if (!isDirectMessageWebhook(event.eventTypes)) {
      this.logger.log(
        `Skipping non-DM webhook eventId=${event.eventId} ` +
          `(processor only handles direct_message_events; got [${event.eventTypes.join(', ')}])`,
      );
      return;
    }

    this.logger.log(`Processing DM webhook eventId=${event.eventId}`);

    const dmContext = parseInboundDmFromWebhook(event.payload, event.xUserId);
    if (!dmContext) {
      return;
    }

    const connection = await this.connectionModel.findOne({
      _id: new Types.ObjectId(event.connectionId),
      orgId: new Types.ObjectId(event.orgId),
      revokedAt: null,
    });
    if (!connection) {
      this.logger.warn(
        `Connection ${event.connectionId} not found for event ${event.eventId}`,
      );
      return;
    }

    if (!connection.authTokenEnc) {
      this.logger.warn(
        `Connection ${event.connectionId} missing authTokenEnc; skipping DM reply`,
      );
      return;
    }

    const org = await this.orgModel.findById(event.orgId);
    if (!org?.systemPrompt?.trim()) {
      this.logger.warn(
        `Organization ${event.orgId} missing systemPrompt; skipping DM reply`,
      );
      return;
    }

    const authToken = this.tokenCrypto.decrypt(connection.authTokenEnc);
    const conversation = await this.getxapi.fetchConversation({
      authToken,
      conversationId: dmContext.conversationId,
    });

    const inboundText =
      this.getxapi.extractLatestIncomingPlainText(
        conversation.messages,
        event.xUserId,
      ) ??
      dmContext.inboundTextFromWebhook?.trim() ??
      null;

    if (!inboundText) {
      this.logger.warn(
        `No inbound plain text for conversation ${dmContext.conversationId} (event ${event.eventId})`,
      );
      return;
    }

    const unknownReply =
      org.unknownReply?.trim() ||
      this.config.get<string>('DEFAULT_UNKNOWN_REPLY') ||
      "I don't know";

    const llmResult = await this.llm.generateReply({
      systemPrompt: org.systemPrompt.trim(),
      unknownReply,
      userMessage: inboundText,
    });

    const replyEvent: XDmReplyReadyEvent = {
      eventId: randomUUID(),
      sourceEventId: event.eventId,
      processedAt: new Date().toISOString(),
      orgId: event.orgId,
      connectionId: event.connectionId,
      xUserId: event.xUserId,
      xUsername: event.xUsername,
      conversationId: dmContext.conversationId,
      recipientId: dmContext.recipientId,
      inboundMessageId: dmContext.inboundMessageId,
      inboundText,
      replyText: llmResult.replyText,
      isKnownAnswer: llmResult.isKnownAnswer,
    };

    await this.natsJs.publishJson(NATS_SUBJECT_DM_REPLY_READY, replyEvent);
  }
}
