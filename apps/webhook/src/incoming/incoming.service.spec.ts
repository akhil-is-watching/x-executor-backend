import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { NATS_SUBJECT_WEBHOOK_RECEIVED, NatsJsService } from '@app/nats-js';
import { XConnection } from '../schemas/x-connection.schema';
import { IncomingService, SHARED_WEBHOOK_ID } from './incoming.service';

describe('IncomingService', () => {
  let service: IncomingService;

  const mockNatsJs = {
    publishJson: jest.fn(),
  };

  const orgId = new Types.ObjectId();
  const connectionId = new Types.ObjectId();

  const connectionDoc = {
    _id: connectionId,
    orgId,
    xUserId: 'x-user-1',
    xUsername: 'testuser',
    revokedAt: undefined,
  };

  const connectionModel = {
    find: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    connectionModel.find.mockResolvedValue([connectionDoc]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IncomingService,
        { provide: NatsJsService, useValue: mockNatsJs },
        {
          provide: getModelToken(XConnection.name),
          useValue: connectionModel,
        },
      ],
    }).compile();

    service = module.get(IncomingService);
  });

  describe('processIncomingPayload', () => {
    it('publishes event per matching connection', async () => {
      const payload = {
        for_user_id: 'x-user-1',
        tweet_create_events: [{ id: '1' }],
      };

      const result = await service.processIncomingPayload(payload);

      expect(result.eventIds).toHaveLength(1);
      expect(mockNatsJs.publishJson).toHaveBeenCalledWith(
        NATS_SUBJECT_WEBHOOK_RECEIVED,
        expect.objectContaining({
          eventId: result.eventIds[0],
          orgId: orgId.toString(),
          connectionId: connectionId.toString(),
          webhookId: SHARED_WEBHOOK_ID,
          xUserId: 'x-user-1',
          xUsername: 'testuser',
          eventTypes: ['tweet_create_events'],
          payload,
        }),
      );
    });

    it('fans out to multiple orgs with the same xUserId', async () => {
      const connectionId2 = new Types.ObjectId();
      connectionModel.find.mockResolvedValue([
        connectionDoc,
        {
          _id: connectionId2,
          orgId: new Types.ObjectId(),
          xUserId: 'x-user-1',
          xUsername: 'testuser',
        },
      ]);

      const result = await service.processIncomingPayload({
        for_user_id: 'x-user-1',
        tweet_create_events: [],
      });

      expect(result.eventIds).toHaveLength(2);
      expect(mockNatsJs.publishJson).toHaveBeenCalledTimes(2);
    });

    it('requires for_user_id', async () => {
      await expect(service.processIncomingPayload({})).rejects.toThrow(
        BadRequestException,
      );
    });

    it('normalizes XAA dm.received payloads before publishing', async () => {
      const rawPayload = {
        data: {
          event_type: 'dm.received',
          filter: { user_id: 'x-user-1' },
          payload: {
            type: 'message_create',
            id: '1',
            message_create: {
              sender_id: 'peer-1',
              target: { recipient_id: 'x-user-1' },
              message_data: { text: 'hi' },
            },
          },
        },
      };

      const result = await service.processIncomingPayload(rawPayload);

      expect(result.eventIds).toHaveLength(1);
      expect(mockNatsJs.publishJson).toHaveBeenCalledWith(
        NATS_SUBJECT_WEBHOOK_RECEIVED,
        expect.objectContaining({
          eventTypes: ['direct_message_events'],
          payload: {
            for_user_id: 'x-user-1',
            direct_message_events: [rawPayload.data.payload],
          },
        }),
      );
    });

    it('throws when no active connection', async () => {
      connectionModel.find.mockResolvedValue([]);
      await expect(
        service.processIncomingPayload({ for_user_id: 'x-user-1' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
