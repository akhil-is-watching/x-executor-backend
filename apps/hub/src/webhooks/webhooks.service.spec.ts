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
      () => 'http://localhost:3001/api/v1/webhooks/incoming',
    ),
    isEnabled: jest.fn(() => false),
    ensureAppWebhookRegistered: jest.fn(),
    subscribeUser: jest.fn(),
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
      'http://localhost:3001/api/v1/webhooks/incoming',
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

    const result = await service.subscribeForConnection(connection, 'token');

    expect(result.webhookUrl).toBe(
      'http://localhost:3001/api/v1/webhooks/incoming',
    );
    expect(result.subscribed).toBe(false);
    expect(webhookModel.create).not.toHaveBeenCalled();
  });
});
