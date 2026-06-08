import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { NATS_SUBJECT_DM_REPLY_READY, NatsJsService } from '@app/nats-js';
import { GetxapiService } from '@app/getxapi';
import { LlmService } from '@app/llm';
import type { XWebhookReceivedEvent } from '@app/shared';
import { TokenCryptoService } from '../crypto/token-crypto.service';
import { XChatDecryptService } from '../xchat/xchat-decrypt.service';
import { Organization } from '../schemas/organization.schema';
import { XConnection } from '../schemas/x-connection.schema';
import { CampaignJob } from '../schemas/campaign-job.schema';
import { DmPipelineService } from './dm-pipeline.service';
import { randomBytes } from 'crypto';

describe('DmPipelineService', () => {
  let service: DmPipelineService;
  const key = randomBytes(32).toString('base64');

  const orgId = new Types.ObjectId();
  const connectionId = new Types.ObjectId();

  const mockXChatDecrypt = { decryptXChatEvent: jest.fn() };
  const mockNats = { publishJson: jest.fn() };
  const mockGetxapi = {
    fetchInboundConversation: jest.fn(),
    extractLatestIncomingPlainText: jest.fn(),
    extractLatestIncomingPeerId: jest.fn(),
  };
  const mockLlm = { generateReply: jest.fn() };

  const connectionModel = { findOne: jest.fn() };
  const orgModel = { findById: jest.fn() };
  const campaignJobModel = { findOne: jest.fn() };

  const baseEvent: XWebhookReceivedEvent = {
    eventId: 'evt-1',
    receivedAt: new Date().toISOString(),
    orgId: orgId.toString(),
    connectionId: connectionId.toString(),
    webhookId: 'wh-1',
    xUserId: '3012852462',
    xUsername: 'botuser',
    eventTypes: ['direct_message_events'],
    payload: {
      direct_message_events: [
        {
          type: 'message_create',
          id: 'dm-1',
          message_create: {
            sender_id: '1345154135381794816',
            target: { recipient_id: '3012852462' },
            message_data: { text: 'hello' },
          },
        },
      ],
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    connectionModel.findOne.mockResolvedValue({
      _id: connectionId,
      orgId,
      authTokenEnc: 'enc-auth',
    });
    orgModel.findById.mockResolvedValue({
      _id: orgId,
      systemPrompt: 'We only sell blue widgets.',
      unknownReply: "I don't know",
    });
    mockGetxapi.fetchInboundConversation.mockResolvedValue({
      conversationId: '3012852462-1345154135381794816',
      recipientId: '1345154135381794816',
      conversation: {
        conversation_id: '3012852462-1345154135381794816',
        messages: [{ id: '1', senderId: '1345154135381794816', text: 'hello' }],
      },
    });
    mockGetxapi.extractLatestIncomingPlainText.mockReturnValue('hello');
    mockGetxapi.extractLatestIncomingPeerId.mockReturnValue('1345154135381794816');
    mockLlm.generateReply.mockResolvedValue({
      replyText: 'We sell blue widgets.',
      isKnownAnswer: true,
    });
    campaignJobModel.findOne.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DmPipelineService,
        TokenCryptoService,
        { provide: NatsJsService, useValue: mockNats },
        { provide: GetxapiService, useValue: mockGetxapi },
        { provide: XChatDecryptService, useValue: mockXChatDecrypt },
        { provide: LlmService, useValue: mockLlm },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (name: string) => {
              if (name === 'TOKEN_ENCRYPTION_KEY') return key;
              throw new Error(name);
            },
            get: (name: string) => {
              if (name === 'DEFAULT_UNKNOWN_REPLY') return "I don't know";
              return undefined;
            },
          },
        },
        { provide: getModelToken(XConnection.name), useValue: connectionModel },
        { provide: getModelToken(Organization.name), useValue: orgModel },
        { provide: getModelToken(CampaignJob.name), useValue: campaignJobModel },
      ],
    }).compile();

    service = module.get(DmPipelineService);
    const crypto = module.get(TokenCryptoService);
    jest.spyOn(crypto, 'decrypt').mockReturnValue('plain-auth-token');
  });

  it('publishes x.dm.reply.ready using webhook text without GetXAPI', async () => {
    await service.handleWebhookEvent(baseEvent);

    expect(mockGetxapi.fetchInboundConversation).not.toHaveBeenCalled();
    expect(mockLlm.generateReply).toHaveBeenCalledWith({
      systemPrompt: 'We only sell blue widgets.',
      unknownReply: "I don't know",
      userMessage: 'hello',
    });
    expect(mockNats.publishJson).toHaveBeenCalledWith(
      NATS_SUBJECT_DM_REPLY_READY,
      expect.objectContaining({
        sourceEventId: 'evt-1',
        orgId: orgId.toString(),
        connectionId: connectionId.toString(),
        conversationId: '3012852462-1345154135381794816',
        recipientId: '1345154135381794816',
        inboundText: 'hello',
        replyText: 'We sell blue widgets.',
        isKnownAnswer: true,
      }),
    );
  });

  it('falls back to GetXAPI when legacy webhook has no message text', async () => {
    await service.handleWebhookEvent({
      ...baseEvent,
      payload: {
        direct_message_events: [
          {
            type: 'message_create',
            id: 'dm-1',
            message_create: {
              sender_id: '1345154135381794816',
              target: { recipient_id: '3012852462' },
              message_data: {},
            },
          },
        ],
      },
    });

    expect(mockGetxapi.fetchInboundConversation).toHaveBeenCalledWith({
      authToken: 'plain-auth-token',
      xUserId: '3012852462',
      conversationId: '3012852462-1345154135381794816',
      recipientId: '1345154135381794816',
    });
    expect(mockNats.publishJson).toHaveBeenCalled();
  });

  it('skips non-DM webhook events', async () => {
    await service.handleWebhookEvent({
      ...baseEvent,
      eventTypes: ['tweet_create_events'],
    });
    expect(mockNats.publishJson).not.toHaveBeenCalled();
  });

  it('ignores XChat event when decrypt fields are missing', async () => {
    await service.handleWebhookEvent({
      ...baseEvent,
      eventTypes: ['x_chat_events'],
      payload: {
        conversation_id: 'xchat-conv-abc',
        x_chat_events: [
          {
            id: 'chat-msg-1',
            conversationId: 'xchat-conv-abc',
            encodedEvent: 'base64...',
            // no conversation_key_change_event
          },
        ],
      },
    });

    expect(mockGetxapi.fetchInboundConversation).not.toHaveBeenCalled();
    expect(mockXChatDecrypt.decryptXChatEvent).not.toHaveBeenCalled();
    expect(mockNats.publishJson).not.toHaveBeenCalled();
  });

  it('decrypts XChat event directly when encoded_event + conversation_key_change_event present', async () => {
    connectionModel.findOne.mockResolvedValue({
      _id: connectionId,
      orgId,
      accessTokenEnc: 'enc-at',
      accessTokenSecretEnc: 'enc-ats',
      xchatPinEnc: 'enc-pin',
      authTokenEnc: 'enc-auth',
    });
    mockXChatDecrypt.decryptXChatEvent.mockResolvedValue('Hey from XChat');

    await service.handleWebhookEvent({
      ...baseEvent,
      eventTypes: ['x_chat_events'],
      payload: {
        for_user_id: '3012852462',
        x_chat_events: [
          {
            id: 'xchat-msg-1',
            sender_id: '2024635972819034112',
            conversation_id: '3012852462:2024635972819034112',
            encoded_event: 'ENCODED_BASE64==',
            conversation_key_change_event: 'KEY_CHANGE_BLOB==',
            conversation_key_version: '1780909207040',
          },
        ],
      },
    });

    expect(mockXChatDecrypt.decryptXChatEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        xUserId: '3012852462',
        encodedEvent: 'ENCODED_BASE64==',
        conversationKeyChangeEvent: 'KEY_CHANGE_BLOB==',
        conversationKeyVersion: '1780909207040',
      }),
    );
    expect(mockGetxapi.fetchInboundConversation).not.toHaveBeenCalled();
    expect(mockNats.publishJson).toHaveBeenCalledWith(
      NATS_SUBJECT_DM_REPLY_READY,
      expect.objectContaining({
        inboundText: 'Hey from XChat',
        recipientId: '2024635972819034112',
      }),
    );
  });

  it('skips XChat event when xchatPinEnc is missing on connection', async () => {
    connectionModel.findOne.mockResolvedValue({
      _id: connectionId,
      orgId,
      accessTokenEnc: 'enc-at',
      accessTokenSecretEnc: 'enc-ats',
      // no xchatPinEnc
    });

    await service.handleWebhookEvent({
      ...baseEvent,
      eventTypes: ['x_chat_events'],
      payload: {
        x_chat_events: [
          {
            id: 'xchat-msg-1',
            sender_id: '2024635972819034112',
            encoded_event: 'ENCODED==',
            conversation_key_change_event: 'KEY_CHANGE==',
          },
        ],
      },
    });

    expect(mockXChatDecrypt.decryptXChatEvent).not.toHaveBeenCalled();
    expect(mockNats.publishJson).not.toHaveBeenCalled();
  });
});
