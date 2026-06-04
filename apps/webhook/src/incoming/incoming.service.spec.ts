import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { NATS_SUBJECT_WEBHOOK_RECEIVED, NatsJsService } from '@app/nats-js';
import { ConnectionWebhook } from '../schemas/connection-webhook.schema';
import { XConnection } from '../schemas/x-connection.schema';
import { IncomingService } from './incoming.service';

describe('IncomingService', () => {
  let service: IncomingService;

  const mockNatsJs = {
    publishJson: jest.fn(),
  };

  const webhookDoc = {
    webhookId: 'wh-1',
    connectionId: new Types.ObjectId(),
    orgId: new Types.ObjectId(),
    active: true,
  };

  const connectionDoc = {
    _id: webhookDoc.connectionId,
    xUserId: 'x-user-1',
    xUsername: 'testuser',
    revokedAt: undefined,
  };

  const webhookModel = {
    findOne: jest.fn(),
  };

  const connectionModel = {
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    webhookModel.findOne.mockResolvedValue(webhookDoc);
    connectionModel.findOne.mockResolvedValue(connectionDoc);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IncomingService,
        { provide: NatsJsService, useValue: mockNatsJs },
        {
          provide: getModelToken(ConnectionWebhook.name),
          useValue: webhookModel,
        },
        {
          provide: getModelToken(XConnection.name),
          useValue: connectionModel,
        },
      ],
    }).compile();

    service = module.get(IncomingService);
  });

  describe('processXWebhook', () => {
    it('publishes event with connection context', async () => {
      const payload = {
        for_user_id: 'x-user-1',
        tweet_create_events: [{ id: '1' }],
      };

      const result = await service.processXWebhook('wh-1', payload);

      expect(result.eventId).toBeDefined();
      expect(mockNatsJs.publishJson).toHaveBeenCalledWith(
        NATS_SUBJECT_WEBHOOK_RECEIVED,
        expect.objectContaining({
          eventId: result.eventId,
          orgId: webhookDoc.orgId.toString(),
          connectionId: webhookDoc.connectionId.toString(),
          webhookId: 'wh-1',
          xUserId: 'x-user-1',
          xUsername: 'testuser',
          eventTypes: ['tweet_create_events'],
          payload,
        }),
      );
    });

    it('rejects for_user_id mismatch', async () => {
      await expect(
        service.processXWebhook('wh-1', { for_user_id: 'other-user' }),
      ).rejects.toThrow(ForbiddenException);
      expect(mockNatsJs.publishJson).not.toHaveBeenCalled();
    });

    it('throws when webhook is not found', async () => {
      webhookModel.findOne.mockResolvedValue(null);
      await expect(
        service.processXWebhook('missing', {}),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws when connection is not found', async () => {
      connectionModel.findOne.mockResolvedValue(null);
      await expect(
        service.processXWebhook('wh-1', {}),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
