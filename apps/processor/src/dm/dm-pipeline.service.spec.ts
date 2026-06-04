import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { NATS_SUBJECT_DM_REPLY_READY, NatsJsService } from '@app/nats-js';
import { GetxapiService } from '@app/getxapi';
import { LlmService } from '@app/llm';
import type { XWebhookReceivedEvent } from '@app/shared';
import { TokenCryptoService } from '../crypto/token-crypto.service';
import { Organization } from '../schemas/organization.schema';
import { XConnection } from '../schemas/x-connection.schema';
import { DmPipelineService } from './dm-pipeline.service';
import { randomBytes } from 'crypto';

describe('DmPipelineService', () => {
  let service: DmPipelineService;
  const key = randomBytes(32).toString('base64');

  const orgId = new Types.ObjectId();
  const connectionId = new Types.ObjectId();

  const mockNats = { publishJson: jest.fn() };
  const mockGetxapi = {
    fetchConversation: jest.fn(),
    extractLatestIncomingPlainText: jest.fn(),
  };
  const mockLlm = { generateReply: jest.fn() };

  const connectionModel = { findOne: jest.fn() };
  const orgModel = { findById: jest.fn() };

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
    mockGetxapi.fetchConversation.mockResolvedValue({
      conversation_id: '3012852462-1345154135381794816',
      messages: [{ id: '1', senderId: '1345154135381794816', text: 'hello' }],
    });
    mockGetxapi.extractLatestIncomingPlainText.mockReturnValue('hello');
    mockLlm.generateReply.mockResolvedValue({
      replyText: 'We sell blue widgets.',
      isKnownAnswer: true,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DmPipelineService,
        TokenCryptoService,
        { provide: NatsJsService, useValue: mockNats },
        { provide: GetxapiService, useValue: mockGetxapi },
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
      ],
    }).compile();

    service = module.get(DmPipelineService);
    const crypto = module.get(TokenCryptoService);
    jest.spyOn(crypto, 'decrypt').mockReturnValue('plain-auth-token');
  });

  it('publishes x.dm.reply.ready for inbound DM webhooks', async () => {
    await service.handleWebhookEvent(baseEvent);

    expect(mockGetxapi.fetchConversation).toHaveBeenCalledWith({
      authToken: 'plain-auth-token',
      conversationId: '3012852462-1345154135381794816',
    });
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

  it('skips non-DM webhook events', async () => {
    await service.handleWebhookEvent({
      ...baseEvent,
      eventTypes: ['tweet_create_events'],
    });
    expect(mockNats.publishJson).not.toHaveBeenCalled();
  });
});
