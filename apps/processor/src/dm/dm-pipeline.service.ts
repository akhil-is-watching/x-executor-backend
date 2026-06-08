import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomUUID } from 'crypto';
import {
  NATS_SUBJECT_CAMPAIGN_ANALYTICS,
  NATS_SUBJECT_DM_REPLY_READY,
  NatsJsService,
} from '@app/nats-js';
import { GetxapiService } from '@app/getxapi';
import { LlmService } from '@app/llm';
import {
  isInboundDmWebhook,
  parseInboundDmFromWebhook,
  type XDmReplyReadyEvent,
  type XWebhookReceivedEvent,
  type CampaignAnalyticsEvent,
} from '@app/shared';
import { TokenCryptoService } from '../crypto/token-crypto.service';
import { XChatDecryptService } from '../xchat/xchat-decrypt.service';
import {
  Organization,
  OrganizationDocument,
} from '../schemas/organization.schema';
import {
  XConnection,
  XConnectionDocument,
} from '../schemas/x-connection.schema';
import {
  CampaignJob,
  CampaignJobDocument,
} from '../schemas/campaign-job.schema';

@Injectable()
export class DmPipelineService {
  private readonly logger = new Logger(DmPipelineService.name);

  constructor(
    @InjectModel(XConnection.name)
    private readonly connectionModel: Model<XConnectionDocument>,
    @InjectModel(CampaignJob.name)
    private readonly campaignJobModel: Model<CampaignJobDocument>,
    @InjectModel(Organization.name)
    private readonly orgModel: Model<OrganizationDocument>,
    private readonly tokenCrypto: TokenCryptoService,
    private readonly getxapi: GetxapiService,
    private readonly xchatDecrypt: XChatDecryptService,
    private readonly llm: LlmService,
    private readonly natsJs: NatsJsService,
    private readonly config: ConfigService,
  ) {}

  async handleWebhookEvent(event: XWebhookReceivedEvent): Promise<void> {
    if (!isInboundDmWebhook(event.eventTypes)) {
      this.logger.log(
        `Skipping non-DM webhook eventId=${event.eventId} ` +
          `(processor only handles inbound DM/XChat; got [${event.eventTypes.join(', ')}])`,
      );
      return;
    }

    const isXChat = event.eventTypes.includes('x_chat_events');
    this.logger.log(
      `Processing ${isXChat ? 'XChat' : 'legacy DM'} webhook eventId=${event.eventId}`,
    );

    const dmContext = parseInboundDmFromWebhook(event.payload, event.xUserId);
    if (!dmContext) {
      this.logger.warn(
        `No parseable DM in webhook payload eventId=${event.eventId}`,
      );
      return;
    }

    const webhookInboundText = dmContext.inboundTextFromWebhook?.trim();
    if (webhookInboundText) {
      this.logger.log(
        `DM event message eventId=${event.eventId} from=${dmContext.recipientId}: ${JSON.stringify(webhookInboundText)}`,
      );
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

    const org = await this.orgModel.findById(event.orgId);
    if (!org?.systemPrompt?.trim()) {
      this.logger.warn(
        `Organization ${event.orgId} missing systemPrompt; skipping DM reply`,
      );
      return;
    }

    let inboundText: string | null = null;
    let recipientId: string | undefined = dmContext.recipientId;
    let resolvedConversationId: string = dmContext.conversationId;

    const canDecryptXChat =
      isXChat &&
      Boolean(dmContext.encodedEvent) &&
      Boolean(dmContext.conversationKeyChangeEvent);

    if (canDecryptXChat) {
      // XChat encrypted path — decrypt directly from webhook payload (no GetXAPI)
      if (!connection.xchatPinEnc) {
        this.logger.warn(
          `Connection ${event.connectionId} has no xchatPinEnc — ` +
            `set it via PATCH /orgs/:orgId/connections/:id/xchat-pin`,
        );
        return;
      }
      if (!connection.accessTokenSecretEnc) {
        this.logger.warn(
          `Connection ${event.connectionId} missing accessTokenSecretEnc; cannot unlock XChat`,
        );
        return;
      }

      const xchatPin = this.tokenCrypto.decrypt(connection.xchatPinEnc);
      const accessToken = this.tokenCrypto.decrypt(connection.accessTokenEnc);
      const accessTokenSecret = this.tokenCrypto.decrypt(
        connection.accessTokenSecretEnc,
      );

      this.logger.log(
        `XChat decrypt path eventId=${event.eventId} conversation=${dmContext.conversationId} ` +
          `keyVersion=${dmContext.conversationKeyVersion ?? 'unknown'}`,
      );

      try {
        inboundText = await this.xchatDecrypt.decryptXChatEvent({
          xUserId: event.xUserId,
          xchatPin,
          accessToken,
          accessTokenSecret,
          encodedEvent: dmContext.encodedEvent!,
          conversationKeyChangeEvent: dmContext.conversationKeyChangeEvent!,
          conversationKeyVersion: dmContext.conversationKeyVersion ?? '',
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `XChat decrypt error eventId=${event.eventId}: ${message}`,
        );
        return;
      }
    } else if (isXChat) {
      this.logger.warn(
        `Skipping XChat webhook eventId=${event.eventId} — missing encoded_event or ` +
          `conversation_key_change_event (cannot decrypt without both)`,
      );
      return;
    } else {
      // Legacy DM path — use webhook plaintext when present, else GetXAPI
      if (!connection.authTokenEnc) {
        this.logger.warn(
          `Connection ${event.connectionId} missing authTokenEnc; skipping DM reply`,
        );
        return;
      }

      const webhookText = dmContext.inboundTextFromWebhook?.trim();
      if (webhookText && dmContext.recipientId) {
        this.logger.log(
          `Legacy DM webhook text path eventId=${event.eventId} ` +
            `conversation=${dmContext.conversationId} from=${dmContext.recipientId}`,
        );
        inboundText = webhookText;
        recipientId = dmContext.recipientId;
        resolvedConversationId = dmContext.conversationId;
      } else {
        const authToken = this.tokenCrypto.decrypt(connection.authTokenEnc);
        this.logger.log(
          `Fetching GetXAPI conversation eventId=${event.eventId} ` +
            `webhookConversation=${dmContext.conversationId} recipientHint=${dmContext.recipientId ?? 'none'}`,
        );
        const inboundConversation = await this.getxapi.fetchInboundConversation({
          authToken,
          xUserId: event.xUserId,
          conversationId: dmContext.conversationId,
          recipientId: dmContext.recipientId,
          conversationToken: dmContext.conversationToken,
          xChatConversationId: dmContext.xChatConversationId,
        });
        const conversation = inboundConversation.conversation;
        resolvedConversationId = inboundConversation.conversationId;

        if (inboundConversation.conversationId !== dmContext.conversationId) {
          this.logger.log(
            `Resolved GetXAPI conversation eventId=${event.eventId} ` +
              `${dmContext.conversationId} → ${inboundConversation.conversationId}`,
          );
        }

        recipientId =
          inboundConversation.recipientId ??
          dmContext.recipientId ??
          this.getxapi.extractLatestIncomingPeerId(
            conversation.messages,
            event.xUserId,
          ) ??
          undefined;

        if (!recipientId) {
          this.logger.warn(
            `No peer recipient for conversation ${inboundConversation.conversationId} (event ${event.eventId})`,
          );
          return;
        }

        inboundText =
          this.getxapi.extractLatestIncomingPlainText(
            conversation.messages,
            event.xUserId,
          ) ??
          webhookText ??
          null;
      }
    }

    if (!recipientId) {
      this.logger.warn(
        `No peer recipient for conversation ${resolvedConversationId} (event ${event.eventId})`,
      );
      return;
    }

    if (!inboundText) {
      this.logger.warn(
        `No inbound plain text for conversation ${resolvedConversationId} (event ${event.eventId})`,
      );
      return;
    }

    this.logger.log(
      `DM inbound text eventId=${event.eventId} conversation=${resolvedConversationId}: ${JSON.stringify(inboundText)}`,
    );

    await this.trackCampaignReply(event, recipientId);

    const unknownReply =
      org.unknownReply?.trim() ||
      this.config.get<string>('DEFAULT_UNKNOWN_REPLY') ||
      "I don't know";

    const llmResult = await this.llm.generateReply({
      systemPrompt: org.systemPrompt.trim(),
      unknownReply,
      userMessage: inboundText,
    });

    this.logger.log(
      `DM generated reply eventId=${event.eventId} known=${llmResult.isKnownAnswer}: ${JSON.stringify(llmResult.replyText)}`,
    );

    const replyEvent: XDmReplyReadyEvent = {
      eventId: randomUUID(),
      sourceEventId: event.eventId,
      processedAt: new Date().toISOString(),
      orgId: event.orgId,
      connectionId: event.connectionId,
      xUserId: event.xUserId,
      xUsername: event.xUsername,
      conversationId: resolvedConversationId,
      recipientId,
      inboundMessageId: dmContext.inboundMessageId,
      inboundText,
      replyText: llmResult.replyText,
      isKnownAnswer: llmResult.isKnownAnswer,
    };

    await this.natsJs.publishJson(NATS_SUBJECT_DM_REPLY_READY, replyEvent);
    this.logger.log(
      `Published ${NATS_SUBJECT_DM_REPLY_READY} replyEventId=${replyEvent.eventId} ` +
        `sourceEventId=${event.eventId}`,
    );
  }

  private async trackCampaignReply(
    event: XWebhookReceivedEvent,
    recipientId: string,
  ): Promise<void> {
    const campaignJob = await this.campaignJobModel.findOne({
      orgId: new Types.ObjectId(event.orgId),
      connectionId: new Types.ObjectId(event.connectionId),
      recipientXUserId: recipientId,
      status: 'sent',
      replyReceived: { $ne: true },
    });

    if (!campaignJob) {
      return;
    }

    const analyticsEvent: CampaignAnalyticsEvent = {
      campaignId: campaignJob.campaignId.toString(),
      orgId: event.orgId,
      jobId: campaignJob._id.toString(),
      type: 'reply_received',
      occurredAt: new Date().toISOString(),
    };

    await this.natsJs.publishJson(
      NATS_SUBJECT_CAMPAIGN_ANALYTICS,
      analyticsEvent,
    );

    this.logger.log(
      `Published campaign reply analytics campaignId=${analyticsEvent.campaignId} ` +
        `jobId=${analyticsEvent.jobId} from recipient=${recipientId}`,
    );
  }
}
