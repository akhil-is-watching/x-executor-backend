import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { GetxapiService } from '@app/getxapi';
import { NatsJsService } from '@app/nats-js';
import { buildConversationId } from '@app/shared';
import { TokenCryptoService } from '../crypto/token-crypto.service';
import { CampaignDmSenderService } from './campaign-dm-sender.service';
import { DmMessage } from '../schemas/dm-message.schema';
import { XConnection } from '../schemas/x-connection.schema';

describe('CampaignDmSenderService', () => {
  let service: CampaignDmSenderService;

  const connectionId = new Types.ObjectId();
  const orgId = new Types.ObjectId();
  const connection = {
    _id: connectionId,
    orgId,
    xUserId: 'bot-user-id',
    xUsername: 'botuser',
    authTokenEnc: 'enc-token',
    revokedAt: null,
  };

  const connectionModel = {
    findOne: jest.fn().mockResolvedValue(connection),
  };

  const dmMessageModel = {
    create: jest.fn().mockResolvedValue({}),
  };

  const tokenCrypto = {
    decrypt: jest.fn().mockReturnValue('auth-token'),
  };

  const getxapi = {
    sendDm: jest.fn().mockResolvedValue({
      status: 'success',
      data: {
        id: 'msg-1',
        recipientId: 'recipient-user-id',
      },
    }),
  };

  const natsJs = {
    publishJson: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    connectionModel.findOne.mockResolvedValue(connection);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CampaignDmSenderService,
        { provide: getModelToken(XConnection.name), useValue: connectionModel },
        { provide: getModelToken(DmMessage.name), useValue: dmMessageModel },
        { provide: TokenCryptoService, useValue: tokenCrypto },
        { provide: GetxapiService, useValue: getxapi },
        { provide: NatsJsService, useValue: natsJs },
      ],
    }).compile();

    service = module.get(CampaignDmSenderService);
  });

  it('records outbound campaign DM in chat history after send', async () => {
    await service.handleCampaignDmReady({
      jobId: 'job-1',
      campaignId: 'camp-1',
      orgId: orgId.toString(),
      connectionId: connectionId.toString(),
      xUserId: 'bot-user-id',
      recipientUsername: 'alice',
      messageText: 'Hello from campaign',
    });

    expect(getxapi.sendDm).toHaveBeenCalled();
    expect(dmMessageModel.create).toHaveBeenCalledWith({
      orgId,
      connectionId,
      xUserId: 'bot-user-id',
      xUsername: 'botuser',
      conversationId: buildConversationId('bot-user-id', 'recipient-user-id'),
      recipientId: 'recipient-user-id',
      recipientUsername: 'alice',
      direction: 'outbound',
      text: 'Hello from campaign',
      processedAt: expect.any(Date),
    });
    expect(natsJs.publishJson).toHaveBeenCalled();
  });

  it('skips chat history when GetXAPI does not return recipientId', async () => {
    getxapi.sendDm.mockResolvedValueOnce({
      status: 'success',
      data: { id: 'msg-1' },
    });

    await service.handleCampaignDmReady({
      jobId: 'job-2',
      campaignId: 'camp-1',
      orgId: orgId.toString(),
      connectionId: connectionId.toString(),
      xUserId: 'bot-user-id',
      recipientUsername: 'bob',
      messageText: 'Hello again',
    });

    expect(dmMessageModel.create).not.toHaveBeenCalled();
  });
});
