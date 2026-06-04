import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { IncomingService } from './incoming/incoming.service';
import { WebhookController } from './webhook.controller';

describe('WebhookController', () => {
  let controller: WebhookController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhookController],
      providers: [
        {
          provide: IncomingService,
          useValue: {
            processIncomingPayload: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (name: string) => {
              if (name === 'X_CLIENT_SECRET') return 'test-secret';
              throw new Error(name);
            },
          },
        },
      ],
    }).compile();

    controller = module.get(WebhookController);
  });

  it('returns health status', () => {
    expect(controller.health()).toEqual({ status: 'ok' });
  });
});
