import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { ConnectionWebhook } from '../schemas/connection-webhook.schema';
import { TokenCryptoService } from '../crypto/token-crypto.service';
import { WebhooksService } from './webhooks.service';
import { XWebhooksApiService } from './x-webhooks-api.service';
import { randomBytes } from 'crypto';

describe('WebhooksService', () => {
  let service: WebhooksService;
  const key = randomBytes(32).toString('base64');

  const mockXWebhooksApi = {
    getSharedWebhookUrl: jest.fn(
      () => 'http://localhost:3001/xbot/v1/api/webhooks/incoming',
    ),
    isEnabled: jest.fn(() => false),
    ensureAppWebhookRegistered: jest.fn(),
    subscribeUser: jest.fn(),
    listSubscriptions: jest.fn(),
    unsubscribeUser: jest.fn(),
  };

  const webhookModel = {
    create: jest.fn(),
    updateMany: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
    findOne: jest.fn(),
    find: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksService,
        TokenCryptoService,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (name: string) => {
              if (name === 'TOKEN_ENCRYPTION_KEY') return key;
              throw new Error(name);
            },
          },
        },
        {
          provide: XWebhooksApiService,
          useValue: mockXWebhooksApi,
        },
        {
          provide: getModelToken(ConnectionWebhook.name),
          useValue: webhookModel,
        },
      ],
    }).compile();

    service = module.get(WebhooksService);
  });

  it('returns shared webhook URL', () => {
    expect(service.getSharedWebhookUrl()).toBe(
      'http://localhost:3001/xbot/v1/api/webhooks/incoming',
    );
  });

  it('creates subscription row when X registration is disabled', async () => {
    const connection = {
      _id: new Types.ObjectId(),
      orgId: new Types.ObjectId(),
      xUserId: 'x-1',
      xUsername: 'user',
      accessTokenEnc: 'enc',
    } as never;

    const result = await service.subscribeForConnection(
      connection,
      'token',
      'token-secret',
    );

    expect(result.webhookUrl).toBe(
      'http://localhost:3001/xbot/v1/api/webhooks/incoming',
    );
    expect(result.subscribed).toBe(false);
    expect(webhookModel.create).not.toHaveBeenCalled();
  });

  it('persists XAA subscription IDs when X registration succeeds', async () => {
    mockXWebhooksApi.isEnabled.mockReturnValue(true);
    mockXWebhooksApi.ensureAppWebhookRegistered.mockResolvedValue('wh-1');
    mockXWebhooksApi.subscribeUser.mockResolvedValue({
      dmSubscriptionId: 'sub-dm-1',
      chatSubscriptionId: 'sub-chat-1',
    });
    mockXWebhooksApi.listSubscriptions.mockResolvedValue([
      { subscription_id: 'sub-dm-1', event_type: 'dm.received' },
      { subscription_id: 'sub-chat-1', event_type: 'chat.received' },
    ]);
    webhookModel.findOne.mockResolvedValue(null);

    const connectionId = new Types.ObjectId();
    const orgId = new Types.ObjectId();
    const connection = {
      _id: connectionId,
      orgId,
      xUserId: '3012852462',
      xUsername: 'botuser',
      accessTokenEnc: 'enc',
    } as never;

    const result = await service.subscribeForConnection(
      connection,
      'token',
      'token-secret',
    );

    expect(mockXWebhooksApi.subscribeUser).toHaveBeenCalledWith(
      'wh-1',
      '3012852462',
      'token',
      'token-secret',
    );
    expect(webhookModel.create).toHaveBeenCalledWith({
      connectionId,
      orgId,
      xWebhookConfigId: 'wh-1',
      dmSubscriptionId: 'sub-dm-1',
      chatSubscriptionId: 'sub-chat-1',
      subscribedAt: expect.any(Date),
      active: true,
    });
    expect(result.subscribed).toBe(true);
    expect(result.xWebhookConfigId).toBe('wh-1');
  });

  it('unsubscribes using stored XAA subscription IDs on revoke', async () => {
    mockXWebhooksApi.isEnabled.mockReturnValue(true);
    webhookModel.findOne.mockResolvedValue({
      dmSubscriptionId: 'sub-dm-1',
      chatSubscriptionId: 'sub-chat-1',
    });

    const connection = {
      _id: new Types.ObjectId(),
      xUserId: '3012852462',
      xUsername: 'botuser',
    } as never;

    await service.revokeForConnection(connection);

    expect(mockXWebhooksApi.unsubscribeUser).toHaveBeenCalledWith(
      'sub-dm-1',
      'sub-chat-1',
    );
  });
});
