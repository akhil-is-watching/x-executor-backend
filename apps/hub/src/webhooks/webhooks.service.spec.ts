import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { ConnectionWebhook } from '../schemas/connection-webhook.schema';
import { TokenCryptoService } from '../crypto/token-crypto.service';
import { WebhooksService } from './webhooks.service';
import { randomBytes } from 'crypto';

describe('WebhooksService', () => {
  let service: WebhooksService;
  const key = randomBytes(32).toString('base64');

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksService,
        TokenCryptoService,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (name: string) => {
              if (name === 'TOKEN_ENCRYPTION_KEY') return key;
              if (name === 'WEBHOOK_PUBLIC_BASE_URL') {
                return 'http://localhost:3001';
              }
              throw new Error(name);
            },
          },
        },
        {
          provide: getModelToken(ConnectionWebhook.name),
          useValue: {
            create: jest.fn(),
            updateMany: jest.fn(),
            findOne: jest.fn(),
            find: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(WebhooksService);
  });

  it('builds webhook URL from webhook public base', () => {
    const url = service.buildWebhookUrl('abc123');
    expect(url).toBe('http://localhost:3001/api/v1/webhooks/incoming/abc123');
  });
});
