import { Types } from 'mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { GetxapiService } from '@app/getxapi';
import type { XDmReplyReadyEvent } from '@app/shared';
import { DmSenderService } from './dm-sender.service';
import { TokenCryptoService } from '../crypto/token-crypto.service';
import { XConnection } from '../schemas/x-connection.schema';

describe('DmSenderService', () => {
  let service: DmSenderService;

  const orgId = new Types.ObjectId();
  const connectionId = new Types.ObjectId();

  const mockConnectionModel = {
    findOne: jest.fn(),
  };

  const mockTokenCrypto = {
    decrypt: jest.fn().mockReturnValue('plain-auth-token'),
  };

  const mockGetxapi = {
    sendDm: jest.fn().mockResolvedValue({
      status: 'success',
      data: { id: 'msg-123' },
    }),
  };

  const baseEvent: XDmReplyReadyEvent = {
    eventId: 'reply-1',
    sourceEventId: 'evt-1',
    processedAt: new Date().toISOString(),
    orgId: orgId.toString(),
    connectionId: connectionId.toString(),
    xUserId: '3012852462',
    xUsername: 'botuser',
    conversationId: '3012852462-1345154135381794816',
    recipientId: '1345154135381794816',
    inboundText: 'hello',
    replyText: 'We sell blue widgets.',
    isKnownAnswer: true,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockConnectionModel.findOne.mockResolvedValue({
      _id: connectionId,
      orgId,
      authTokenEnc: 'enc:token',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DmSenderService,
        {
          provide: getModelToken(XConnection.name),
          useValue: mockConnectionModel,
        },
        { provide: TokenCryptoService, useValue: mockTokenCrypto },
        { provide: GetxapiService, useValue: mockGetxapi },
      ],
    }).compile();

    service = module.get(DmSenderService);
  });

  it('sends DM via GetXAPI for reply-ready events', async () => {
    await service.handleReplyReady(baseEvent);

    expect(mockConnectionModel.findOne).toHaveBeenCalledWith({
      _id: connectionId,
      orgId,
      revokedAt: null,
    });
    expect(mockTokenCrypto.decrypt).toHaveBeenCalledWith('enc:token');
    expect(mockGetxapi.sendDm).toHaveBeenCalledWith({
      authToken: 'plain-auth-token',
      recipientId: '1345154135381794816',
      text: 'We sell blue widgets.',
    });
  });

  it('skips when connection is missing', async () => {
    mockConnectionModel.findOne.mockResolvedValue(null);

    await service.handleReplyReady(baseEvent);

    expect(mockGetxapi.sendDm).not.toHaveBeenCalled();
  });

  it('skips when auth token is missing', async () => {
    mockConnectionModel.findOne.mockResolvedValue({
      _id: connectionId,
      orgId,
      authTokenEnc: undefined,
    });

    await service.handleReplyReady(baseEvent);

    expect(mockGetxapi.sendDm).not.toHaveBeenCalled();
  });
});
